import { detectIdentifier, type Identifier } from "./lookup";

// A DOI inside a publisher's link, e.g. https://onlinelibrary.wiley.com/doi/full/10.1002/abc.123
const DOI_IN_URL = /\/(10\.\d{4,9}\/[^\s?#&]+)/;
// Words publishers put after the DOI in a link; they aren't part of it.
const LINK_SUFFIX = /\/(?:abstract|full|fulltext|pdf|epdf|html|summary|references)$/i;
// bioRxiv and medRxiv links add a version and a page to the DOI: 10.1101/2020.03.01.123456v2.full.pdf
const PREPRINT_SUFFIX = /^(10\.1101\/.+?)(?:v\d+)?(?:\.full(?:\.pdf|-text)?|\.abstract|\.article-info|\.supplementary-material)?$/i;
// The old PubMed address, still all over the web.
const OLD_PUBMED = /^(?:https?:\/\/)?(?:www\.)?ncbi\.nlm\.nih\.gov\/pubmed\/(\d{1,9})\/?$/i;

/**
 * Drops what a sentence or a link leaves stuck to the end of an identifier: a full stop,
 * comma, closing quote or bracket, and a closing parenthesis that nothing opened. DOIs can
 * contain balanced parentheses, like 10.1016/S0140-6736(20)30183-5, so those stay.
 */
function trimTrailing(text: string) {
  let out = text;
  for (;;) {
    const next = out.replace(/[.,;:\]}>"'\u201d\u2019]+$/, "");
    const opens = (next.match(/\(/g) ?? []).length;
    const closes = (next.match(/\)/g) ?? []).length;
    const trimmed = next.endsWith(")") && closes > opens ? next.slice(0, -1) : next;
    if (trimmed === out) return out;
    out = trimmed;
  }
}

function tidyDoi(doi: string) {
  let out = trimTrailing(doi);
  while (LINK_SUFFIX.test(out)) out = out.replace(LINK_SUFFIX, "");
  return out.replace(PREPRINT_SUFFIX, "$1");
}

/**
 * Whether pasted text is one paper identifier that should become a citation: a DOI or a
 * doi.org link, a publisher link with a DOI in it, an arXiv id written as arXiv or linked,
 * or a PubMed id written as PMID or linked. Bare numbers like "2101.01234" or "12345678"
 * could be anything, so they stay plain text. Anything with spaces in it is text too.
 */
export function pastedIdentifier(input: string): Identifier | null {
  const raw = input.trim();
  if (!raw || raw.length > 300 || /\s/.test(raw)) return null;
  const text = trimTrailing(raw);

  const oldPubmed = text.match(OLD_PUBMED)?.[1];
  if (oldPubmed) return { kind: "pubmed", id: oldPubmed };

  if (/^(?:doi:|10\.|(?:https?:\/\/)?(?:dx\.)?doi\.org\/)/i.test(text)) {
    const ident = detectIdentifier(tidyDoi(text));
    return ident?.kind === "doi" || ident?.kind === "arxiv" ? ident : null;
  }
  if (/arxiv/i.test(text) || /pubmed|^pmid/i.test(text)) return detectIdentifier(text);

  if (/^https?:\/\//i.test(text)) {
    const inUrl = text.match(DOI_IN_URL)?.[1];
    if (!inUrl) return null;
    let doi: string;
    try {
      doi = decodeURIComponent(inUrl);
    } catch {
      // A stray % that isn't an escape: not a link we can read.
      return null;
    }
    return detectIdentifier(tidyDoi(doi));
  }
  return null;
}

/** The text to look the identifier up by, in the form the lookup understands. */
export function identifierQuery(ident: Identifier) {
  return ident.kind === "pubmed" ? `PMID:${ident.id}` : ident.kind === "arxiv" ? `arXiv:${ident.id}` : ident.id;
}

/** Whether a library entry is the paper an identifier names. */
export function matchesIdentifier(source: { doi: string | null; notes: string | null }, ident: Identifier) {
  if (ident.kind === "doi") return source.doi?.toLowerCase() === ident.id.toLowerCase();
  if (ident.kind === "arxiv") {
    const bare = ident.id.toLowerCase();
    return source.doi?.toLowerCase() === `10.48550/arxiv.${bare}` || (source.notes ?? "").toLowerCase().includes(`arxiv:${bare}`);
  }
  return new RegExp(`\\bPMID:\\s*${ident.id}\\b`).test(source.notes ?? "");
}
