import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { FILE_COLUMNS, FILES_BUCKET, type ProjectFile } from "@/lib/files/files";
import { FileReader } from "@/components/files/file-reader";

export const metadata: Metadata = { title: "File" };

export default async function FilePage({ params }: PageProps<"/projects/[projectId]/files/[fileId]">) {
  const { projectId, fileId } = await params;
  if (!z.string().uuid().safeParse(projectId).success || !z.string().uuid().safeParse(fileId).success) notFound();

  const { supabase, user } = await getUser();
  if (!user) notFound(); // the proxy already redirects signed-out visitors

  const [projectResult, fileResult] = await Promise.all([
    supabase.from("projects").select("id, name, accent").eq("id", projectId).maybeSingle(),
    supabase.from("project_files").select(`${FILE_COLUMNS}, storage_path`).eq("id", fileId).eq("project_id", projectId).maybeSingle(),
  ]);
  const error = projectResult.error ?? fileResult.error;
  if (error) throw new Error(`Couldn't load the file: ${error.message}`);
  // Row-level security hides other people's projects and files, which reads as "not found".
  if (!projectResult.data || !fileResult.data) notFound();

  const { storage_path: path, ...file } = fileResult.data;
  const [signed, sourceResult] = await Promise.all([
    // An hour is enough to read; the Download button asks for a fresh link.
    supabase.storage.from(FILES_BUCKET).createSignedUrl(path, 60 * 60),
    file.source_id ? supabase.from("sources").select("id, title").eq("id", file.source_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (signed.error || !signed.data) throw new Error("Couldn't open the file right now.");

  return <FileReader project={projectResult.data} file={file as ProjectFile} url={signed.data.signedUrl} source={sourceResult.data} />;
}
