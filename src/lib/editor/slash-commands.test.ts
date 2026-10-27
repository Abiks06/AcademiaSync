import { describe, expect, it } from "vitest";
import { SLASH_COMMANDS, filterCommands } from "./slash-commands";

const ids = (query: string) => filterCommands(SLASH_COMMANDS, query).map((c) => c.id);

describe("filterCommands", () => {
  it("offers everything before anything is typed", () => {
    expect(ids("")).toHaveLength(SLASH_COMMANDS.length);
  });

  it("puts title matches first, then keyword matches", () => {
    expect(ids("h")[0]).toBe("h1");
    expect(ids("list")).toEqual(["bullets", "numbers"]);
    expect(ids("hr")).toEqual(["divider"]);
    expect(ids("quo")[0]).toBe("quote");
  });

  it("finds nothing for nonsense", () => {
    expect(ids("zzz")).toEqual([]);
  });
});
