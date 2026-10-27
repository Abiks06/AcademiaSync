import { detectIdentifier, type Identifier } from "./lookup";

// A DOI inside a publisher's link, e.g. https://onlinelibrary.wiley.com/doi/full/10.1002/abc.123
const DOI_IN_URL = /\/(10\.\d{4,9}\/[^\s?#&]+)/;
// Words publishers put after the DOI in a link; they aren't part of it.
const LINK_SUFFIX = /\/(?:abstract|full|fulltext|pdf|epdf|html|summary|references)$/i;

/**
 * Whether pasted text is one paper identifier that should become a citation: a DOI or a
 * doi.org link, a publisher link with a DOI in it, an arXiv id written as arXiv or linked,
 * or a PubMed id written as PMID or linked. Bare numbers like "2101.01234" or "12345678"
 * could be anything, so they stay plain text. Anything with spaces in it is text too.
 */
export function pastedIdentifier(input: string): Identifier | null {
  const text = input.trim();
  if (!text || text.length > 300 || /\s/.test(text)) return null;

  if (/^(?:doi:|10\.|(?:https?:\/\/)?(?:dx\.)?doi\.org\/)/i.test(text)) {
    const ident = detectIdentifier(text);
    return ident?.kind === "doi" || ident?.kind === "arxiv" ? ident : null;
  }
  if (/arxiv/i.test(text) || /pubmed|^pmid/i.test(text)) return detectIdentifier(text);

  if (/^https?:\/\//i.test(text)) {
    const inUrl = text.match(DOI_IN_URL)?.[1];
    if (!inUrl) return null;
    let doi = decodeURIComponent(inUrl);
    while (LINK_SUFFIX.test(doi)) doi = doi.replace(LINK_SUFFIX, "");
    return detectIdentifier(doi);
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
