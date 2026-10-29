import { expect, test } from "@playwright/test";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { admin, e2eConfigured, signedInUser } from "./fixtures";

test.skip(!e2eConfigured, "Set E2E_BASE_URL, the Supabase settings and SUPABASE_SECRET_KEY to run the files tests.");

/** A one-page PDF with a line of real text, built by hand so the test needs no fixture file. */
function tinyPdf(text: string) {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

test("a member uploads, reads, attaches and deletes project files", async ({ browser }) => {
  const db = admin();
  const context = await browser.newContext();
  const page = await context.newPage();
  let userId: string | undefined;
  let projectId: string | undefined;
  try {
    const user = await signedInUser(db, context, "files");
    userId = user.id;
    const project = await db.from("projects").insert({ name: "E2E files", created_by: user.id }).select("id").single();
    if (project.error) throw project.error;
    projectId = project.data.id;
    await db
      .from("sources")
      .insert({ project_id: projectId, created_by: user.id, kind: "article", title: "Microplastics in the deep sea", authors: [{ family: "Woodall", given: "Lucy" }], year: 2014 })
      .throwOnError();

    await page.goto(`/projects/${projectId}/files`);
    await expect(page.getByRole("heading", { name: "No files yet" })).toBeVisible();

    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("Reviewer letter, round two")] })] }] }));
    await page.getByLabel("Choose files to upload").setInputFiles([
      { name: "Woodall 2014.pdf", mimeType: "application/pdf", buffer: tinyPdf("Microfibres in deep-sea sediments") },
      { name: "Reviewer letter.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(docx) },
    ]);
    await expect(page.getByRole("link", { name: "Woodall 2014.pdf" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reviewer letter.docx" })).toBeVisible();

    // Attach the PDF to its source.
    const pdfRow = page.getByRole("listitem").filter({ hasText: "Woodall 2014.pdf" });
    await pdfRow.getByLabel("Attached source").selectOption({ label: "Woodall (2014) · Microplastics in the deep sea" });
    await expect(page.getByText("Attached to the source")).toBeVisible();

    // The PDF opens with selectable text.
    await page.getByRole("link", { name: "Woodall 2014.pdf" }).click();
    await expect(page.getByText("Page 1 of 1")).toBeVisible();
    await expect(page.locator(".textLayer")).toContainText("Microfibres in deep-sea sediments");

    // The library and the citation card can open it.
    await page.goto(`/projects/${projectId}/library`);
    await page.getByRole("link", { name: "Open attached file" }).click();
    await expect(page.locator(".textLayer")).toContainText("Microfibres");

    // The Word file renders inside its sandboxed frame.
    await page.goto(`/projects/${projectId}/files`);
    await page.getByRole("link", { name: "Reviewer letter.docx" }).click();
    await expect(page.frameLocator('iframe[title="Word document"]').getByText("Reviewer letter, round two")).toBeVisible();

    // Delete one.
    await page.goto(`/projects/${projectId}/files`);
    const wordRow = page.getByRole("listitem").filter({ hasText: "Reviewer letter.docx" });
    await wordRow.getByRole("button", { name: "Delete" }).click();
    await wordRow.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("link", { name: "Reviewer letter.docx" })).toHaveCount(0);
    const left = await db.storage.from("project-files").list(projectId);
    expect(left.data?.length).toBe(1);
  } finally {
    if (projectId) {
      const files = await db.from("project_files").select("storage_path").eq("project_id", projectId);
      if (files.data?.length) await db.storage.from("project-files").remove(files.data.map((f) => f.storage_path));
      await db.from("projects").delete().eq("id", projectId);
    }
    if (userId) await db.auth.admin.deleteUser(userId);
    await context.close();
  }
});
