/* The wheel's sound, made with Web Audio: the click of a small metal switch as each name passes the middle, and a
   short note for the state of the city it stops on. A browser starts audio only after a press or a key, not after
   the mouse wheel, so nothing plays until then. */

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let level = 1;

export function setVolume(v: number) { level = Math.max(0, v); }

export function unlock() {
  if (!context) {
    try { context = new AudioContext(); } catch { return; }
    noise = context.createBuffer(1, Math.round(context.sampleRate * 0.05), context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
}
export function soundReady() { return context?.state === 'running'; }

/* clicks closer than gap seconds are one run: each click of a run is higher, up to top, and a pause brings it down */
const RUN = { gap: 0.22, step: 0.07, top: 2 };
let last = 0, bend = 1;

function fade(ctx: AudioContext, at: number, gain: number, duration: number) {
  const node = ctx.createGain();
  node.gain.setValueAtTime(Math.max(gain * level, 0.0001), at);
  node.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  node.connect(ctx.destination);
  return node;
}

export function click() {
  const ctx = context;
  if (!ctx || ctx.state !== 'running' || !noise || level <= 0) return;
  const at = ctx.currentTime;
  bend = at - last < RUN.gap ? Math.min(bend + RUN.step, RUN.top) : 1;
  last = at;
  /* no two clicks of a real switch are the same */
  const pitch = bend * (1 + (Math.random() - 0.5) * 0.06);
  /* the snap: a very short burst of bright noise */
  const snap = ctx.createBufferSource(); snap.buffer = noise;
  const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 2500 * pitch;
  snap.connect(high).connect(fade(ctx, at, 0.8, 0.006)); snap.start(at);
  /* the ring of the spring under the snap, bending down, so a run of clicks rises */
  const ring = ctx.createOscillator(); ring.type = 'square';
  ring.frequency.setValueAtTime(1800 * pitch, at); ring.frequency.exponentialRampToValueAtTime(900 * pitch, at + 0.018);
  ring.connect(fade(ctx, at, 0.12, 0.018)); ring.start(at); ring.stop(at + 0.03);
}

type Note = { type: OscillatorType; from: number; to?: number; delay?: number; duration: number; gain: number };
function note(ctx: AudioContext, { type, from, to = from, delay = 0, duration, gain }: Note) {
  const at = ctx.currentTime + delay;
  const osc = ctx.createOscillator(); osc.type = type;
  osc.frequency.setValueAtTime(from, at); osc.frequency.exponentialRampToValueAtTime(to, at + duration);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at); amp.gain.exponentialRampToValueAtTime(Math.max(gain * level, 0.0001), at + 0.006); amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  /* a lowpass takes the hard edge off a square wave, so it sounds like an old speaker */
  const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 2400;
  osc.connect(soft).connect(amp).connect(ctx.destination); osc.start(at); osc.stop(at + duration + 0.02);
}

/* open goes up, nearing capacity is one note, the waiting list goes down, lower and duller, and not open yet is one
   short quiet note */
export type WheelStatus = 'open' | 'nearing' | 'full' | 'soon';
const NOTES: Record<WheelStatus, Note[]> = {
  open: [{ type: 'triangle', from: 880, duration: 0.09, gain: 0.3 }, { type: 'triangle', from: 1320, delay: 0.08, duration: 0.16, gain: 0.3 }],
  nearing: [{ type: 'triangle', from: 990, to: 960, duration: 0.2, gain: 0.3 }],
  soon: [{ type: 'triangle', from: 660, duration: 0.12, gain: 0.18 }],
  full: [{ type: 'square', from: 330, duration: 0.1, gain: 0.12 }, { type: 'square', from: 247, to: 233, delay: 0.1, duration: 0.2, gain: 0.12 }],
};
export function settle(status: WheelStatus) {
  const ctx = context;
  if (!ctx || ctx.state !== 'running' || level <= 0) return;
  for (const n of NOTES[status]) note(ctx, n);
}
