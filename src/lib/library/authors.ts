import type { Author } from "./types";

/**
 * Reads one author per line. "Lusher, Amy" is family then given names; a line
 * without a comma is read as "Given Family", so "Amy L. Lusher" works too.
 * A single word is treated as a family name (or an organisation).
 */
export function parseAuthors(text: string): Author[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes(",")) {
        const [family, ...given] = line.split(",");
        return { family: family.trim(), given: given.join(",").trim() };
      }
      const words = line.split(/\s+/);
      if (words.length === 1) return { family: words[0], given: "" };
      return { family: words[words.length - 1], given: words.slice(0, -1).join(" ") };
    })
    .filter((a) => a.family);
}

export function authorsToText(authors: Author[]) {
  return authors.map((a) => (a.given ? `${a.family}, ${a.given}` : a.family)).join("\n");
}

/** Authors read from the database or an API, dropping anything that isn't {family, given?}. */
export function sanitizeAuthors(value: unknown): Author[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((a) => {
    if (typeof a !== "object" || a === null) return [];
    const { family, given } = a as Record<string, unknown>;
    if (typeof family !== "string" || !family) return [];
    return [{ family, given: typeof given === "string" ? given : "" }];
  });
}
