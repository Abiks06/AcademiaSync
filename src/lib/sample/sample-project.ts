import { CITATION_NODE, type CitationItem, type CitationMode } from "@/lib/library/citations";
import { citeContext, formatCitation } from "@/lib/library/styles";
import type { DocJSON } from "@/lib/editor/ydoc";
import type { SourceFields } from "@/lib/library/types";

/**
 * The sample project new people can open to see the whole product before inviting anyone.
 * Every source is a real, checked paper (DOIs verified against OpenAlex), and the text only
 * says what those papers say, so nothing in it misleads someone who keeps it.
 */
export const SAMPLE_PROJECT = {
  name: "Sample: Microplastics in coastal waters",
  field: "Marine science",
  description: "An example project to explore: a short review draft with real sources and citations. Edit anything, or delete it when you're done.",
  accent: "teal" as const,
};

export const SAMPLE_DOCUMENT_TITLE = "Where does ocean plastic go? A short review";

type Key = "thompson" | "jambeck" | "andrady" | "cole" | "eriksen";

const article = (fields: Omit<SourceFields, "kind" | "publisher" | "url" | "abstract">): SourceFields => ({
  kind: "article",
  publisher: null,
  url: null,
  abstract: null,
  ...fields,
});

export const SAMPLE_SOURCES: Record<Key, SourceFields> = {
  thompson: article({
    title: "Lost at sea: Where is all the plastic?",
    authors: [
      { family: "Thompson", given: "Richard C." },
      { family: "Olsen", given: "Ylva" },
      { family: "Mitchell", given: "Richard P." },
      { family: "Davis", given: "Anthony" },
      { family: "Rowland", given: "Steven J." },
      { family: "John", given: "Anthony W. G." },
      { family: "McGonigle", given: "Daniel" },
      { family: "Russell", given: "Andrea E." },
    ],
    year: 2004,
    container: "Science",
    volume: "304",
    issue: "5672",
    pages: "838",
    doi: "10.1126/science.1094559",
    notes: "Sample note: the classic early paper on microscopic plastic fragments. Good for the opening claim of the introduction.",
  }),
  jambeck: article({
    title: "Plastic waste inputs from land into the ocean",
    authors: [
      { family: "Jambeck", given: "Jenna R." },
      { family: "Geyer", given: "Roland" },
      { family: "Wilcox", given: "Chris" },
      { family: "Siegler", given: "Theodore R." },
      { family: "Perryman", given: "Miriam" },
      { family: "Andrady", given: "Anthony" },
      { family: "Narayan", given: "Ramani" },
      { family: "Law", given: "Kara Lavender" },
    ],
    year: 2015,
    container: "Science",
    volume: "347",
    issue: "6223",
    pages: "768–771",
    doi: "10.1126/science.1260352",
    notes: "Sample note: the 4.8 to 12.7 million tonne estimate for 2010. Check whether a newer estimate should sit alongside it.",
  }),
  andrady: article({
    title: "Microplastics in the marine environment",
    authors: [{ family: "Andrady", given: "Anthony L." }],
    year: 2011,
    container: "Marine Pollution Bulletin",
    volume: "62",
    issue: "8",
    pages: "1596–1605",
    doi: "10.1016/j.marpolbul.2011.05.030",
    notes: "Sample note: how weathering and sunlight break larger plastic into microplastics.",
  }),
  cole: article({
    title: "Microplastics as contaminants in the marine environment: A review",
    authors: [
      { family: "Cole", given: "Matthew" },
      { family: "Lindeque", given: "Pennie" },
      { family: "Halsband", given: "Claudia" },
      { family: "Galloway", given: "Tamara S." },
    ],
    year: 2011,
    container: "Marine Pollution Bulletin",
    volume: "62",
    issue: "12",
    pages: "2588–2597",
    doi: "10.1016/j.marpolbul.2011.09.025",
    notes: "Sample note: a broad review, including uptake by marine organisms.",
  }),
  eriksen: article({
    title: "Plastic pollution in the world's oceans: More than 5 trillion plastic pieces weighing over 250,000 tons afloat at sea",
    authors: [
      { family: "Eriksen", given: "Marcus" },
      { family: "Lebreton", given: "Laurent C. M." },
      { family: "Carson", given: "Henry S." },
      { family: "Thiel", given: "Martin" },
      { family: "Moore", given: "Charles J." },
      { family: "Borrero", given: "Jose C." },
      { family: "Galgani", given: "Francois" },
      { family: "Ryan", given: "Peter G." },
      { family: "Reisser", given: "Julia" },
    ],
    year: 2014,
    container: "PLoS ONE",
    volume: "9",
    issue: "12",
    pages: "e111913",
    doi: "10.1371/journal.pone.0111913",
    notes: "Sample note: the floating-plastic estimate. Compare with the input estimates to show how little stays at the surface.",
  }),
};

/** A real paper that isn't in the sample library, for trying out pasting a DOI. */
export const SAMPLE_PASTE_DOI = "10.1126/sciadv.1700782";

const text = (value: string): DocJSON => ({ type: "text", text: value });
const para = (...content: DocJSON[]): DocJSON => ({ type: "paragraph", content });
const heading = (value: string): DocJSON => ({ type: "heading", attrs: { level: 2 }, content: [text(value)] });
const bullets = (...items: string[]): DocJSON => ({
  type: "bulletList",
  content: items.map((item) => ({ type: "listItem", content: [para(text(item))] })),
});

/** The sample manuscript, citing the sources by the ids the database gave them. */
export function sampleManuscript(ids: Record<Key, string>): DocJSON {
  const cited: string[] = [];
  const cite = (keys: Key[], mode: CitationMode = "parenthetical"): DocJSON => {
    const items: CitationItem[] = keys.map((k) => ({ sourceId: ids[k] }));
    for (const { sourceId } of items) if (!cited.includes(sourceId)) cited.push(sourceId);
    const byId = new Map((Object.keys(ids) as Key[]).map((k) => [ids[k], SAMPLE_SOURCES[k]]));
    const label = formatCitation(items, mode, citeContext("apa", cited, (id) => byId.get(id)));
    return { type: CITATION_NODE, attrs: { items, mode, label } };
  };

  return {
    type: "doc",
    content: [
      heading("Introduction"),
      para(
        text("Plastic debris is now found in almost every marine habitat that has been sampled. Microscopic fragments were reported in beach, estuarine and subtidal sediments, and in archived plankton samples, where they became more abundant from the 1960s onwards "),
        cite(["thompson"]),
        text(". Larger items weather and break apart into microplastics under sunlight and mechanical wear "),
        cite(["andrady"]),
        text(", and these particles are taken up by a wide range of marine organisms "),
        cite(["cole"]),
        text("."),
      ),
      heading("How much plastic reaches the sea"),
      para(
        cite(["jambeck"], "narrative"),
        text(" estimated that between 4.8 and 12.7 million tonnes of plastic waste entered the ocean from coastal countries in 2010. Only a small part of that is found floating at the surface: one global estimate puts it at more than five trillion pieces weighing over 250,000 tonnes "),
        cite(["eriksen"]),
        text(". The gap between these figures is the subject of this review."),
      ),
      heading("Open questions"),
      bullets(
        "Where does the plastic that isn't floating end up: in sediments, in the water column, or in living things?",
        "Which coastal habitats act as sinks, and how can they be sampled in the same way?",
        "What does ingestion mean for animals further up the food web?",
      ),
      heading("Things to try"),
      bullets(
        "Hover over a citation to see the paper, the team's notes on it, and a link to the library.",
        `Paste a DOI into the text, such as ${SAMPLE_PASTE_DOI}, and it becomes a citation.`,
        "Type / at the start of a line for headings, lists and quotes.",
        "Press Ctrl+K (⌘K on a Mac) to jump to any project, manuscript or source.",
      ),
      para(text("This is a sample project. Everything in it is yours to edit, and you can delete the whole project from its page when you're done.")),
    ],
  };
}
