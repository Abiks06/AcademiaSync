export const ACCENTS = {
  iris: { color: "var(--iris)", label: "Iris" },
  teal: { color: "var(--teal)", label: "Teal" },
  amber: { color: "var(--amber)", label: "Amber" },
  rose: { color: "var(--rose)", label: "Rose" },
} as const;

export type Accent = keyof typeof ACCENTS;

export function accentColor(accent: string) {
  return (ACCENTS as Record<string, { color: string }>)[accent]?.color ?? ACCENTS.iris.color;
}

export function initials(name: string) {
  return name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function timeAgo(iso: string, now: number) {
  const s = Math.max(1, Math.round((now - new Date(iso).getTime()) / 1000));
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
  ];
  let value = s;
  for (const [step, unit] of units) {
    if (value < step) return `${Math.floor(value)} ${unit}${Math.floor(value) === 1 ? "" : "s"} ago`;
    value /= step;
  }
  return `${Math.floor(value)} years ago`;
}
