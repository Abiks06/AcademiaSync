import { describe, expect, it } from "vitest";
import { mailApps, suggestEmail } from "./email-hints";

describe("suggestEmail", () => {
  it.each([
    ["ada@gmial.com", "ada@gmail.com"],
    ["ada@gmal.com", "ada@gmail.com"],
    ["ada@hotmial.com", "ada@hotmail.com"],
    ["ada@outlok.com", "ada@outlook.com"],
    ["Ada.Lovelace@yahooo.com", "Ada.Lovelace@yahoo.com"],
    ["ada@icloud.con", "ada@icloud.com"],
    ["ada@ed.ac.uk.con", "ada@ed.ac.uk.com"],
    ["ada@mit.eud", "ada@mit.edu"],
  ])("corrects %s", (typed, meant) => {
    expect(suggestEmail(typed)).toBe(meant);
  });

  it.each(["ada@gmail.com", "ada@ed.ac.uk", "ada@uni-heidelberg.de", "ada@mail.com", "ada@gmx.de", "ada@mac.com", "ada@ucl.ac.uk", "ada@gmail", "ada", "", "@gmial.com"])(
    "leaves %s alone",
    (typed) => {
      expect(suggestEmail(typed)).toBeNull();
    },
  );
});

describe("mailApps", () => {
  it("links straight to a known provider", () => {
    expect(mailApps("ada@gmail.com").map((a) => a.label)).toEqual(["Gmail"]);
    expect(mailApps("ada@hotmail.co.uk").map((a) => a.label)).toEqual(["Outlook"]);
  });

  it("offers Outlook and Gmail for a university domain", () => {
    expect(mailApps("ada@ed.ac.uk").map((a) => a.label)).toEqual(["Outlook", "Gmail"]);
  });
});
