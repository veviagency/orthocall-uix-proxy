// src/lib/liveListenPlayer.ts - V19
// OrthoCall UIX: listen-only browser audio player
// Türkçe:
// - Server relay'den gelen base64 mu-law 8k audio chunk'larını çalar.
// - Inbound / outbound için AYRI queue tutar ve browser içinde mix eder.
// - Böylece both_tracks modunda tek queue yüzünden oluşan yapay lag/choppy etki azalır.

type LiveListenState =
  | { status: "idle"; note?: string }
  | { status: "connecting"; note?: string }
  | { status: "live"; note?: string }
  | { status: "ended"; note?: string }
  | { status: "error"; note?: string };

let _ws: WebSocket | null = null;
let _ctx: AudioContext | null = null;
let _onState: ((s: LiveListenState) => void) | null = null;

// Türkçe:
// Tek _nextAt yerine track başına ayrı zaman çizgisi.
// Böylece inbound chunk'lar outbound chunk'ları bekletmez.
let _nextAtInbound = 0;
let _nextAtOutbound = 0;

// Türkçe: browser içinde basit mix için ayrı gain node'lar
let _masterGain: GainNode | null = null;
let _inboundGain: GainNode | null = null;
let _outboundGain: GainNode | null = null;

// Türkçe: küçük sabit jitter buffer
const BASE_JITTER_SEC = 0.06;
const MAX_TRACK_QUEUE_AHEAD_SEC = 1.0;

// Türkçe: outbound'ı hafif kısalım ki karşı tarafı bastırmasın
const INBOUND_GAIN = 1.0;
const OUTBOUND_GAIN = 0.82;

function _emit(s: LiveListenState) {
  try {
    if (_onState) _onState(s);
  } catch {}
}

function _b64ToBytes(b64: string) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

function _muLawToPcm16(uVal: number) {
  let u = (~uVal) & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample = sign ? (0x84 - sample) : (sample - 0x84);
  return sample;
}

function _decodeMulawToFloat32(b64: string) {
  const bytes = _b64ToBytes(b64);
  const out = new Float32Array(bytes.length);

  for (let i = 0; i < bytes.length; i++) {
    const s16 = _muLawToPcm16(bytes[i]);
    out[i] = Math.max(-1, Math.min(1, s16 / 32768));
  }

  return out;
}

async function _ensureAudioCtx() {
  const AnyWin = window as any;
  const Ctx = window.AudioContext || AnyWin.webkitAudioContext;
  if (!Ctx) throw new Error("AudioContext_not_supported");

  if (!_ctx) {
    _ctx = new Ctx({ sampleRate: 8000 });
  }

  if (_ctx.state !== "running") {
    await _ctx.resume();
  }

  if (!_masterGain) {
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 1.0;
    _masterGain.connect(_ctx.destination);
  }

  if (!_inboundGain) {
    _inboundGain = _ctx.createGain();
    _inboundGain.gain.value = INBOUND_GAIN;
    _inboundGain.connect(_masterGain);
  }

  if (!_outboundGain) {
    _outboundGain = _ctx.createGain();
    _outboundGain.gain.value = OUTBOUND_GAIN;
    _outboundGain.connect(_masterGain);
  }

  return _ctx;
}

function _pickTrack(trackRaw: string) {
  const t = String(trackRaw || "").trim().toLowerCase();

  // Twilio track isimleri farklı varyasyonlarda gelebilir.
  if (t.includes("outbound")) return "outbound";
  if (t.includes("inbound")) return "inbound";

  // Türkçe: bilinmeyen track gelirse inbound gibi davranalım.
  return "inbound";
}

function _normalizeTrackClock(ctx: AudioContext, track: "inbound" | "outbound") {
  let nextAt = track === "outbound" ? _nextAtOutbound : _nextAtInbound;

  if (nextAt < ctx.currentTime + 0.04) {
    nextAt = ctx.currentTime + BASE_JITTER_SEC;
  }

  // Türkçe: track queue çok öne gittiyse tekrar yakına çek.
  if ((nextAt - ctx.currentTime) > MAX_TRACK_QUEUE_AHEAD_SEC) {
    nextAt = ctx.currentTime + 0.08;
  }

  if (track === "outbound") _nextAtOutbound = nextAt;
  else _nextAtInbound = nextAt;

  return nextAt;
}

async function _playMulawChunk(payload: string, trackRaw: string) {
  if (!_ctx || !_masterGain || !_inboundGain || !_outboundGain) return;

  const pcm = _decodeMulawToFloat32(payload);
  if (!pcm.length) return;

  const ctx = _ctx;
  const track = _pickTrack(trackRaw);

  const buffer = ctx.createBuffer(1, pcm.length, 8000);
  buffer.copyToChannel(pcm, 0);

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  if (track === "outbound") {
    src.connect(_outboundGain);
  } else {
    src.connect(_inboundGain);
  }

  const at = _normalizeTrackClock(ctx, track);
  src.start(at);

  if (track === "outbound") {
    _nextAtOutbound = at + buffer.duration;
  } else {
    _nextAtInbound = at + buffer.duration;
  }
}

export async function stopLiveListenSession() {
  try {
    if (_ws) {
      try { _ws.close(); } catch {}
      _ws = null;
    }

    if (_masterGain) {
      try { _masterGain.disconnect(); } catch {}
      _masterGain = null;
    }

    if (_inboundGain) {
      try { _inboundGain.disconnect(); } catch {}
      _inboundGain = null;
    }

    if (_outboundGain) {
      try { _outboundGain.disconnect(); } catch {}
      _outboundGain = null;
    }

    if (_ctx) {
      try { await _ctx.close(); } catch {}
      _ctx = null;
    }

    _nextAtInbound = 0;
    _nextAtOutbound = 0;

    _emit({ status: "idle", note: "" });
  } catch {}
}

export async function startLiveListenSession(
  wsUrl: string,
  onState?: (s: LiveListenState) => void,
) {
  await stopLiveListenSession();

  _onState = onState || null;
  _emit({ status: "connecting", note: "Connecting live audio..." });

  await _ensureAudioCtx();

  if (_ctx) {
    _nextAtInbound = _ctx.currentTime + BASE_JITTER_SEC;
    _nextAtOutbound = _ctx.currentTime + BASE_JITTER_SEC;
  }

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(String(wsUrl || ""));
    _ws = ws;

    ws.onopen = () => {
      _emit({ status: "connecting", note: "Secure audio relay connected..." });
      resolve();
    };

    ws.onerror = () => {
      reject(new Error("live_listen_ws_connect_failed"));
    };

    ws.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(String(ev.data || "{}"));

        if (msg.type === "hello" || msg.type === "stream_started") {
          _emit({ status: "live", note: "Listening live." });
          return;
        }

        if (msg.type === "media") {
          await _playMulawChunk(
            String(msg.payload || ""),
            String(msg.track || "")
          );
          return;
        }

        if (msg.type === "stop" || msg.type === "end") {
          _emit({ status: "ended", note: "Live call ended." });
          await stopLiveListenSession();
          return;
        }
      } catch {}
    };

    ws.onclose = async () => {
      if (_ws === ws) {
        _emit({ status: "ended", note: "Live audio session closed." });
        await stopLiveListenSession();
      }
    };
  }).catch(async (e) => {
    _emit({ status: "error", note: e instanceof Error ? e.message : String(e) });
    await stopLiveListenSession();
    throw e;
  });
}
