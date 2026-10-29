import { expect, test } from "@playwright/test";
import { field, makeDocx, p, r } from "../src/lib/import/docx-fixture";
import { admin, e2eConfigured, signedInUser } from "./fixtures";

test.skip(!e2eConfigured, "Set E2E_BASE_URL, the Supabase settings and SUPABASE_SECRET_KEY to run the import tests.");

const zotero = (items: unknown[]) =>
  `ADDIN ZOTERO_ITEM CSL_CITATION ${JSON.stringify({ citationID: "e2e", properties: { formattedCitation: "", noteIndex: 0 }, citationItems: items })}`;

const woodall = { id: 1, type: "article-journal", title: "Microplastics in the deep sea", author: [{ family: "Woodall", given: "Lucy" }], issued: { "date-parts": [[2014]] } };
const smith = { id: 2, type: "article-journal", title: "Fibres in abyssal sediments", author: [{ family: "Smith", given: "Ana" }], issued: { "date-parts": [[2020]] }, "container-title": "Deep-Sea Research" };

test("a Word draft with Zotero citations becomes a manuscript linked to the library", async ({ browser }) => {
  const db = admin();
  const context = await browser.newContext();
  const page = await context.newPage();
  let userId: string | undefined;
  let projectId: string | undefined;
  try {
    const user = await signedInUser(db, context, "import");
    userId = user.id;
    const project = await db.from("projects").insert({ name: "E2E import", created_by: user.id }).select("id").single();
    if (project.error) throw project.error;
    projectId = project.data.id;
    await db
      .from("sources")
      .insert({ project_id: projectId, created_by: user.id, kind: "article", title: "Microplastics in the deep sea", authors: [{ family: "Woodall", given: "Lucy" }], year: 2014 })
      .throwOnError();

    const docx = await makeDocx(
      p(r("Deep-sea draft"), "Title") +
        p(r("Fibres reach the sea floor ") + field(zotero([{ id: 1, itemData: woodall }, { id: 2, itemData: smith, locator: "4", label: "page" }]), "(Woodall, 2014; Smith, 2020, p. 4)") + r(".")),
    );
    await page.goto(`/projects/${projectId}/files`);
    await expect(page.getByRole("heading", { name: "No files yet" })).toBeVisible();
    await page.getByLabel("Choose files to upload").setInputFiles([
      { name: "Draft.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from(docx) },
    ]);
    const row = page.getByRole("listitem").filter({ hasText: "Draft.docx" });
    await row.getByRole("button", { name: "Import as manuscript" }).click();

    const dialog = page.getByRole("dialog", { name: "Import as a manuscript" });
    await expect(dialog.getByText("Found 1 citation using 2 sources, made with a reference manager.")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /Already in the library/ })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /From the file's citations/ })).toBeVisible();
    await expect(dialog.getByLabel("Title")).toHaveValue("Deep-sea draft");
    await dialog.getByRole("button", { name: "Create manuscript" }).click();

    await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
    const documentId = page.url().split("/").at(-1)!;
    // One citation of both sources, the new one added once.
    const sources = await db.from("sources").select("id, title").eq("project_id", projectId);
    expect(sources.data?.map((s) => s.title).sort()).toEqual(["Fibres in abyssal sediments", "Microplastics in the deep sea"]);
    const docs = await db.from("documents").select("title").eq("project_id", projectId);
    expect(docs.data).toEqual([{ title: "Deep-sea draft" }]);
    const state = await db.from("document_state").select("plain_text").eq("document_id", documentId).single();
    expect(state.data?.plain_text).toContain("Fibres reach the sea floor");
    const cited = await db.from("document_citations").select("source_id, citations").eq("document_id", documentId);
    expect(cited.data?.map((c) => c.source_id).sort()).toEqual(sources.data!.map((s) => s.id).sort());
    const version = await db.from("document_versions").select("label, content").eq("document_id", documentId).single();
    expect(version.data?.label).toBe("Imported from Draft.docx");
    const paragraph = JSON.stringify(version.data?.content);
    expect(paragraph).toContain('"locator":"4"');
    expect(paragraph).not.toContain("pending");
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
