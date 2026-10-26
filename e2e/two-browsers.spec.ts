import { expect, test } from "@playwright/test";
import { admin, e2eConfigured, signedInUser } from "./fixtures";

test.skip(!e2eConfigured, "Set E2E_BASE_URL, the Supabase settings and SUPABASE_SECRET_KEY to run the two-browser tests.");

test("two people write and cite in one manuscript", async ({ browser }) => {
  const db = admin();
  const ada = await browser.newContext();
  const ben = await browser.newContext();
  const userIds: string[] = [];
  let projectId: string | undefined;

  try {
    const a = await signedInUser(db, ada, "ada");
    const b = await signedInUser(db, ben, "ben");
    userIds.push(a.id, b.id);

    const project = await db.from("projects").insert({ name: "E2E project", created_by: a.id }).select("id").single();
    if (project.error) throw project.error;
    projectId = project.data.id;
    await db.from("project_members").insert({ project_id: projectId, user_id: b.id, role: "author" }).throwOnError();
    const source = await db
      .from("sources")
      .insert({ project_id: projectId, created_by: a.id, kind: "report", title: "Microplastics in fisheries and aquaculture", authors: [{ family: "Lusher", given: "Amy" }], year: 2017 })
      .select("id")
      .single();
    if (source.error) throw source.error;
    const document = await db.from("documents").insert({ project_id: projectId, title: "E2E manuscript", created_by: a.id }).select("id").single();
    if (document.error) throw document.error;

    const url = `/projects/${projectId}/documents/${document.data.id}`;
    const [pageA, pageB] = await Promise.all([ada.newPage(), ben.newPage()]);
    await Promise.all([pageA.goto(url), pageB.goto(url)]);
    const editorA = pageA.locator(".ProseMirror");
    const editorB = pageB.locator(".ProseMirror");
    await expect(editorA).toBeVisible();
    await expect(editorB).toBeVisible();

    // Typing in one browser shows up in the other.
    await editorA.click();
    await pageA.keyboard.type("Plastic is everywhere ");
    await expect(editorB).toContainText("Plastic is everywhere");

    // "[@" opens the picker; Enter cites the first match. The other browser shows it as valid.
    await pageA.keyboard.type("[@");
    await expect(pageA.getByRole("dialog", { name: "Cite a source" })).toBeVisible();
    await pageA.keyboard.type("Lusher");
    await pageA.keyboard.press("Enter");
    await expect(editorB.locator(".citation")).toContainText("Lusher");
    await expect(editorB.locator(".citation.is-missing")).toHaveCount(0);

    // Deleting the source shows a warning on the citation in the other browser, without a reload.
    await db.from("sources").update({ deleted_at: new Date().toISOString() }).eq("id", source.data.id).throwOnError();
    await expect(editorB.locator(".citation.is-missing")).toHaveCount(1, { timeout: 20_000 });

    // Reloading keeps the text.
    await pageB.reload();
    await expect(pageB.locator(".ProseMirror")).toContainText("Plastic is everywhere");

    // A save that never reaches the server shows an error and leaves the dialog usable.
    await pageA.goto(`/projects/${projectId}/library`);
    await pageA.getByRole("button", { name: "Add source" }).click();
    await pageA.locator("#src-title").fill("A source saved offline");
    await pageA.route("**/*", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await pageA.getByRole("button", { name: "Add to library" }).click();
    await expect(pageA.getByRole("alert")).toContainText("Couldn't reach AcademiaSync");
    await expect(pageA.getByRole("button", { name: "Add to library" })).toBeEnabled();
  } finally {
    if (projectId) await db.from("projects").delete().eq("id", projectId);
    for (const id of userIds) await db.auth.admin.deleteUser(id);
    await ada.close();
    await ben.close();
  }
});
