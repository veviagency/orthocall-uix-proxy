// src/lib/liveListenPlayer.ts
// OrthoCall UIX: listen-only browser audio player
// Türkçe:
// - Server relay'den gelen base64 mu-law 8k audio chunk'larını çalar.
// - Browser input göndermez; sadece speaker/output kullanır.
// V18

type LiveListenState =
  | { status: "idle"; note?: string }
  | { status: "connecting"; note?: string }
  | { status: "live"; note?: string }
  | { status: "ended"; note?: string }
  | { status: "error"; note?: string };

let _ws: WebSocket | null = null;
let _ctx: AudioContext | null = null;
let _nextAt = 0;
let _onState: ((s: LiveListenState) => void) | null = null;

function _emit(s: LiveListenState) {
  try { if (_onState) _onState(s); } catch {}
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

  return _ctx;
}

async function _playMulawChunk(payload: string) {
  if (!_ctx) return;

  const pcm = _decodeMulawToFloat32(payload);
  if (!pcm.length) return;

  const ctx = _ctx;
  const buffer = ctx.createBuffer(1, pcm.length, 8000);
  buffer.copyToChannel(pcm, 0);

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);

  // Türkçe: küçük jitter buffer; fazla birikirse kuyruğu kısalt.
  if (_nextAt < ctx.currentTime + 0.04) _nextAt = ctx.currentTime + 0.04;
  if ((_nextAt - ctx.currentTime) > 1.0) _nextAt = ctx.currentTime + 0.08;

  src.start(_nextAt);
  _nextAt += buffer.duration;
}

export async function stopLiveListenSession() {
  try {
    if (_ws) {
      try { _ws.close(); } catch {}
      _ws = null;
    }

    if (_ctx) {
      try { await _ctx.close(); } catch {}
      _ctx = null;
    }

    _nextAt = 0;
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
  if (_ctx) _nextAt = _ctx.currentTime + 0.06;

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
          await _playMulawChunk(String(msg.payload || ""));
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
