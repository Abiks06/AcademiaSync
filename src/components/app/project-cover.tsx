"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A project's cover, like the cover of a journal issue: a topographic map drawn from the
 * project itself. The terrain is seeded by its id and title, the ink is its colour, and the
 * contours grow denser as manuscripts are added. Nothing is uploaded and no two are alike.
 *
 * Each cover is drawn once per colour scheme and kept for the rest of the visit.
 */

const W = 960;
const H = 300;
const STEP = 8;
const cache = new Map<string, string>();

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise in a few octaves, plus a couple of hills so it reads as land. */
function terrain(seed: number) {
  const rand = random(seed);
  const octaves = [5, 9, 17].map((cells) => {
    const gw = cells + 2;
    const gh = Math.ceil((cells * H) / W) + 2;
    return { cells, gw, values: Array.from({ length: gw * gh }, rand) };
  });
  const hills = Array.from({ length: 2 + Math.floor(rand() * 2) }, () => ({
    x: rand() * W,
    y: rand() * H,
    r: 90 + rand() * 160,
    h: 0.5 + rand() * 0.7,
  }));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    let v = 0;
    let amp = 1;
    for (const o of octaves) {
      const fx = (x / W) * o.cells;
      const fy = (y / W) * o.cells;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = smooth(fx - ix);
      const ty = smooth(fy - iy);
      const at = (i: number, j: number) => o.values[j * o.gw + i];
      const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
      const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
      v += (top * (1 - ty) + bottom * ty) * amp;
      amp *= 0.45;
    }
    for (const hill of hills) v += hill.h * Math.exp(-((x - hill.x) ** 2 + (y - hill.y) ** 2) / (2 * hill.r * hill.r));
    return v;
  };
}

export function drawCover(seed: string, color: string, manuscripts: number) {
  const key = `${seed}|${color}|${Math.min(manuscripts, 8)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const height = terrain(hash(seed));
  const cols = W / STEP + 1;
  const rows = H / STEP + 1;
  const field = new Float32Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const v = height(i * STEP, j * STEP);
      field[j * cols + i] = v;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }

  // A soft wash of the project's colour from one corner, as the old covers had.
  const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.75);
  wash.addColorStop(0, withAlpha(color, 0.22));
  wash.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  // More manuscripts, more contours: the map fills in as the work grows.
  const levels = 9 + Math.round(Math.min(manuscripts, 8) * 1.6);
  ctx.lineCap = "round";
  for (let l = 1; l < levels; l++) {
    const level = min + ((max - min) * l) / levels;
    const index = l % 4 === 0;
    ctx.strokeStyle = withAlpha(color, index ? 0.62 : 0.3);
    ctx.lineWidth = index ? 1.7 : 1.1;
    ctx.beginPath();
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        const a = field[j * cols + i];
        const b = field[j * cols + i + 1];
        const c = field[(j + 1) * cols + i + 1];
        const d = field[(j + 1) * cols + i];
        const x = i * STEP;
        const y = j * STEP;
        // Where the contour crosses each edge of this square, if it does.
        const cross: [number, number][] = [];
        if (a < level !== b < level) cross.push([x + (STEP * (level - a)) / (b - a), y]);
        if (b < level !== c < level) cross.push([x + STEP, y + (STEP * (level - b)) / (c - b)]);
        if (d < level !== c < level) cross.push([x + (STEP * (level - d)) / (c - d), y + STEP]);
        if (a < level !== d < level) cross.push([x, y + (STEP * (level - a)) / (d - a)]);
        for (let k = 0; k + 1 < cross.length; k += 2) {
          ctx.moveTo(cross[k][0], cross[k][1]);
          ctx.lineTo(cross[k + 1][0], cross[k + 1][1]);
        }
      }
    ctx.stroke();
  }

  const url = canvas.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

/** `color` as an rgba() with this alpha, whatever form the browser computed it in. */
function withAlpha(color: string, alpha: number) {
  const m = color.match(/[\d.]+/g);
  if (!m || m.length < 3) return color;
  return `rgb(${m[0]} ${m[1]} ${m[2]} / ${alpha})`;
}

export function ProjectCover({
  seed,
  accent,
  manuscripts,
  className = "",
}: {
  /** The project's id and name. */
  seed: string;
  /** A CSS colour, usually a theme variable. */
  accent: string;
  manuscripts: number;
  className?: string;
}) {
  const probe = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const el = probe.current;
    if (!el) return;
    // The theme colours differ between light and dark, so the cover is redrawn when they switch.
    const draw = () => setUrl(drawCover(seed, getComputedStyle(el).color, manuscripts) || null);
    const scheme = window.matchMedia("(prefers-color-scheme: light)");
    const frame = requestAnimationFrame(draw);
    scheme.addEventListener("change", draw);
    return () => {
      cancelAnimationFrame(frame);
      scheme.removeEventListener("change", draw);
    };
  }, [seed, accent, manuscripts]);

  return (
    <div
      ref={probe}
      aria-hidden
      className={`bg-cover bg-left-top transition-opacity duration-500 ${className}`}
      style={{ color: accent, backgroundImage: url ? `url(${url})` : undefined, opacity: url ? 1 : 0 }}
    />
  );
}
