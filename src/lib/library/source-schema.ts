import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeDoi } from "@/lib/library/crossref";
import { SOURCE_KINDS } from "@/lib/library/types";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .nullish()
    .transform((v) => v || null);

/** A source's fields as a person (or an import) sends them, checked and tidied. */
export const fieldsSchema = z.object({
  kind: z.enum(SOURCE_KINDS),
  title: z.string().trim().min(1, "A source needs a title.").max(500, "Keep the title under 500 characters."),
  authors: z
    .array(
      z.object({
        family: z.string().trim().min(1).max(100, "Keep each author's family name under 100 characters."),
        given: z.string().trim().max(100, "Keep each author's given names under 100 characters."),
      }),
    )
    .max(100, "That is more than 100 authors. Keep the first 100 and add the rest in the notes."),
  year: z
    .number()
    .int()
    .min(1000, "Enter a four-digit year.")
    .max(2200, "Enter a four-digit year.")
    .nullish()
    .transform((v) => v ?? null),
  container: text(300),
  volume: text(40),
  issue: text(40),
  pages: text(40),
  publisher: text(300),
  doi: text(200).transform((v, ctx) => {
    if (v === null) return null;
    const doi = normalizeDoi(v);
    if (!doi) ctx.issues.push({ code: "custom", message: "That DOI looks wrong. It starts with 10. and has a slash.", input: v });
    return doi;
  }),
  url: text(2000)
    .refine((v) => v === null || /^https?:\/\//i.test(v), "A link must start with http:// or https://")
    // The scheme is case-insensitive; store it the usual way.
    .transform((v) => (v ? v.replace(/^https?:\/\//i, (s) => s.toLowerCase()) : v)),
  abstract: text(10000),
  notes: text(5000),
});

/** A stable id per imported row, so sending the same import twice adds each reference once. */
export function rowRequestId(requestId: string, index: number) {
  const hex = createHash("sha256").update(`${requestId}:${index}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
