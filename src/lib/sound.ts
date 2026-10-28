"use client";

import { useSyncExternalStore } from "react";

/**
 * A small, optional set of sounds, off unless someone turns them on: a soft paper tap when
 * work is saved, a pen click when a citation goes in, and a muffled press for the seal. They
 * are synthesised on the spot, so there are no files to load.
 */

export type Sound = "tap" | "click" | "press";

const KEY = "academiasync:sounds";
const listeners = new Set<() => void>();
let context: AudioContext | null = null;

function read() {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundsOn(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "on");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage is blocked (a private window, say); sounds just stay off.
  }
  listeners.forEach((l) => l());
  if (on) play("click");
}

export function useSoundsOn() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => false,
  );
}

/** A short burst of filtered noise, shaped like a fingertip on paper or a pen's click. */
function burst(ctx: AudioContext, at: number, { freq, q, length, gain }: { freq: number; q: number; length: number; gain: number }) {
  const samples = Math.ceil(ctx.sampleRate * length);
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / samples) ** 3;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  const level = ctx.createGain();
  level.gain.value = gain;
  source.connect(filter).connect(level).connect(ctx.destination);
  source.start(at);
}

export function play(sound: Sound) {
  if (typeof window === "undefined" || !read()) return;
  try {
    context ??= new AudioContext();
    const ctx = context;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime + 0.01;
    if (sound === "tap") burst(ctx, now, { freq: 1800, q: 0.8, length: 0.06, gain: 0.18 });
    if (sound === "click") {
      burst(ctx, now, { freq: 4200, q: 4, length: 0.018, gain: 0.22 });
      burst(ctx, now + 0.045, { freq: 3000, q: 4, length: 0.014, gain: 0.12 });
    }
    if (sound === "press") burst(ctx, now, { freq: 260, q: 0.9, length: 0.22, gain: 0.5 });
  } catch {
    // No audio here; nothing is lost.
  }
}
