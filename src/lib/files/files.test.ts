import { describe, expect, it } from "vitest";
import { contentTypeFor, fileKind, formatBytes, storageName, storagePath } from "./files";

describe("files", () => {
  it("knows a file's type from its extension, whatever the case", () => {
    expect(contentTypeFor("Paper.PDF")).toBe("application/pdf");
    expect(contentTypeFor("notes.md")).toBe("text/markdown");
    expect(contentTypeFor("macro.docm")).toBeNull();
    expect(contentTypeFor("no-extension")).toBeNull();
    expect(fileKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("word");
  });

  it("turns any name into a safe Storage key, keeping the extension", () => {
    expect(storageName("Okafor ch2 (final) – v3.docx")).toBe("Okafor-ch2-final-v3.docx");
    expect(storageName("../../etc/passwd.pdf")).toBe("etc-passwd.pdf");
    expect(storageName("论文.pdf")).toBe("file.pdf");
    expect(storagePath("p", "f", "a b.pdf")).toBe("p/f/a-b.pdf");
  });

  it("formats sizes", () => {
    expect(formatBytes(12)).toBe("12 bytes");
    expect(formatBytes(340 * 1024)).toBe("340 KB");
    expect(formatBytes(1.24 * 1024 * 1024)).toBe("1.2 MB");
  });
});
