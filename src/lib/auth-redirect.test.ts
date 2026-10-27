import { describe, expect, it } from "vitest";
import { safeNext } from "./auth-redirect";

describe("safeNext", () => {
  it("keeps same-site paths with their query and hash", () => {
    expect(safeNext("/projects/abc?tab=library#top")).toBe("/projects/abc?tab=library#top");
  });

  it.each(["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/%09/evil.com".replace("%09", "\t"), "https://evil.com", "evil.com", "", null, 42])(
    "refuses %j",
    (value) => {
      expect(safeNext(value)).toBe("/projects");
    },
  );

  it("never returns a value that resolves off-site", () => {
    for (const value of ["/%2F/evil.com", "/.//evil.com", "/\r\n/evil.com"]) {
      const next = safeNext(value);
      expect(new URL(next, "https://academiasync.app").origin).toBe("https://academiasync.app");
    }
  });
});
