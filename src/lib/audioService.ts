import { useCallback, useEffect, useState } from "react";
import { readLocalItem } from "./storage";

const STORAGE_KEY = "sprout_sound_enabled";
const LEGACY_STORAGE_KEY = "matterpro:sound-enabled";
export const SOUND_ENABLED_EVENT = "matterpro:sound-enabled";

type SoundEnabledDetail = { enabled: boolean };

type AudioContextWindow = {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

type Engine = {
  ctx: AudioContext;
  master: GainNode;
};

let enabled = readStoredEnabled();
let engine: Engine | null = null;
let unlockInstalled = false;
let lastFanfareAt = 0;

const listeners = new Set<(enabled: boolean) => void>();

function readStoredEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = readLocalItem(STORAGE_KEY, LEGACY_STORAGE_KEY);
    if (raw === "0" || raw === "false") return false;
    if (raw === "1" || raw === "true") return true;
  } catch {
    // private mode / quota
  }
  return true;
}

function notify(next: boolean) {
  for (const listener of listeners) listener(next);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SoundEnabledDetail>(SOUND_ENABLED_EVENT, { detail: { enabled: next } }));
}

function AudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as AudioContextWindow;
  return win.AudioContext || win.webkitAudioContext || null;
}

function createEngine(): Engine | null {
  const Ctor = AudioContextCtor();
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 10;
  compressor.ratio.value = 2.6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.14;
  master.connect(compressor);
  compressor.connect(ctx.destination);
  return { ctx, master };
}

function getEngine(): Engine | null {
  if (typeof window === "undefined") return null;
  if (!engine) engine = createEngine();
  if (engine && engine.ctx.state === "suspended") void engine.ctx.resume();
  return engine;
}

function installUnlockGesture() {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    getEngine();
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
}

installUnlockGesture();

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    enabled = readStoredEnabled();
    notify(enabled);
  });
}

function now(ctx: AudioContext) {
  return ctx.currentTime;
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  {
    type,
    frequency,
    start,
    duration,
    peak,
    attack = 0.008,
    detune = 0,
  }: {
    type: OscillatorType;
    frequency: number;
    start: number;
    duration: number;
    peak: number;
    attack?: number;
    detune?: number;
  }
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  osc.detune.setValueAtTime(detune, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(start);
  osc.stop(start + duration + 0.04);
}

function noiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  start: number,
  duration: number,
  peak: number,
  highpassHz: number
) {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(highpassHz, start);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start(start);
  src.stop(start + duration + 0.02);
}

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(next: boolean) {
  enabled = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // private mode / quota
  }
  notify(next);
}

export function subscribeSoundEnabled(listener: (next: boolean) => void): () => void {
  listeners.add(listener);
  listener(enabled);
  return () => {
    listeners.delete(listener);
  };
}

export function useSoundEnabled() {
  const [on, setOn] = useState(enabled);
  useEffect(() => subscribeSoundEnabled(setOn), []);
  const set = useCallback((next: boolean) => {
    setSoundEnabled(next);
    if (next) playTransactionClick();
  }, []);
  return [on, set] as const;
}

function withAudio(play: (ctx: AudioContext, dest: AudioNode) => void) {
  if (!enabled) return;
  const graph = getEngine();
  if (!graph) return;
  try {
    play(graph.ctx, graph.master);
  } catch {
    // Autoplay or closed context — fail silently.
  }
}

/** High-pitch harmonic chime for finishing a lesson or answering a quiz correctly. */
export function playSuccessChime() {
  withAudio((ctx, dest) => {
    const t = now(ctx);
    const notes = [1046.5, 1318.5, 1568, 2093];
    notes.forEach((frequency, index) => {
      const start = t + index * 0.055;
      tone(ctx, dest, {
        type: "sine",
        frequency,
        start,
        duration: 0.42,
        peak: 0.11 - index * 0.012,
        attack: 0.006,
      });
      tone(ctx, dest, {
        type: "triangle",
        frequency: frequency * 2.01,
        start,
        duration: 0.22,
        peak: 0.028,
        attack: 0.004,
      });
    });
  });
}

/** Deep, glowing, futuristic synth sequence for certificates and trophies. */
export function playAchievementFanfare() {
  const stamp = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (stamp - lastFanfareAt < 900) return;
  lastFanfareAt = stamp;

  withAudio((ctx, dest) => {
    const t = now(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.setValueAtTime(5.5, t);
    filter.frequency.setValueAtTime(240, t);
    filter.frequency.exponentialRampToValueAtTime(2200, t + 0.55);
    filter.frequency.exponentialRampToValueAtTime(820, t + 1.45);
    filter.connect(dest);

    tone(ctx, dest, {
      type: "sine",
      frequency: 55,
      start: t,
      duration: 1.35,
      peak: 0.09,
      attack: 0.05,
    });
    tone(ctx, filter, {
      type: "sawtooth",
      frequency: 110,
      start: t,
      duration: 1.2,
      peak: 0.05,
      attack: 0.04,
      detune: -7,
    });
    tone(ctx, filter, {
      type: "sawtooth",
      frequency: 110,
      start: t,
      duration: 1.2,
      peak: 0.045,
      attack: 0.04,
      detune: 9,
    });

    const arp = [130.81, 196, 261.63, 329.63, 392, 523.25];
    arp.forEach((frequency, index) => {
      const start = t + 0.12 + index * 0.14;
      tone(ctx, dest, {
        type: "triangle",
        frequency,
        start,
        duration: 0.38,
        peak: 0.08,
        attack: 0.01,
      });
      tone(ctx, dest, {
        type: "sine",
        frequency: frequency * 2,
        start,
        duration: 0.26,
        peak: 0.03,
        attack: 0.008,
      });
    });

    tone(ctx, dest, {
      type: "sine",
      frequency: 1760,
      start: t + 0.98,
      duration: 0.55,
      peak: 0.045,
      attack: 0.012,
    });
    tone(ctx, dest, {
      type: "sine",
      frequency: 2349,
      start: t + 1.08,
      duration: 0.48,
      peak: 0.03,
      attack: 0.01,
    });
  });
}

/** Crisp, subtle haptic click for buy / sell controls. */
export function playTransactionClick() {
  withAudio((ctx, dest) => {
    const t = now(ctx);
    tone(ctx, dest, {
      type: "sine",
      frequency: 210,
      start: t,
      duration: 0.04,
      peak: 0.055,
      attack: 0.001,
    });
    tone(ctx, dest, {
      type: "square",
      frequency: 1950,
      start: t,
      duration: 0.028,
      peak: 0.035,
      attack: 0.001,
    });
    noiseBurst(ctx, dest, t, 0.018, 0.045, 2200);
  });
}
