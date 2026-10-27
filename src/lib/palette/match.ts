const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** How well one typed word fits the text: whole-word starts beat substrings, which beat scattered letters. */
function wordScore(word: string, text: string) {
  const at = text.indexOf(word);
  if (at === 0) return 8;
  if (at > 0) return /[\s\-_/:(.]/.test(text[at - 1]) ? 6 : 3;
  // Letters in order, like "lst" for "Lost at sea".
  let i = 0;
  let gaps = 0;
  for (const ch of text) {
    if (ch === word[i]) i++;
    else if (i > 0) gaps++;
    if (i === word.length) break;
  }
  if (i < word.length || word.length < 2) return null;
  return Math.max(0.5, 2 - gaps / 10);
}

/**
 * Scores how well a query matches an item, or null when it doesn't. Every typed word has to
 * appear in the label or keywords; matches in the label count for more. Case and accents
 * are ignored, so "lusher" finds "Lüsher".
 */
export function matchScore(query: string, label: string, keywords = "") {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const l = fold(label);
  const k = fold(keywords);
  let total = 0;
  for (const word of words) {
    const inLabel = wordScore(word, l);
    const inKeywords = wordScore(word, k);
    if (inLabel === null && inKeywords === null) return null;
    total += Math.max(inLabel ?? 0, (inKeywords ?? 0) * 0.6);
  }
  // Among equal matches, shorter labels are closer to what was typed.
  return total - Math.min(l.length, 120) / 400;
}

/** Items that match, best first, at most `limit`. Ties keep their original order. */
export function rank<T>(items: T[], query: string, text: (item: T) => { label: string; keywords?: string }, limit = 40) {
  return items
    .map((item, index) => {
      const { label, keywords } = text(item);
      return { item, index, score: matchScore(query, label, keywords) };
    })
    .filter((r): r is { item: T; index: number; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.item);
}
