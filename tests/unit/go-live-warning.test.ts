import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("Go Live warning", () => {
  it("warns that the free publish is one chance and edits lock after live", () => {
    const goLive = read("src", "components", "editor", "GoLiveButton.tsx");

    expect(goLive).toContain("One chance:");
    expect(goLive).toContain("Publish once — then edits are locked");
    expect(goLive).toContain("once this website is live, you cannot make changes");
    expect(goLive).toContain("I understand — publish");
    expect(goLive).toContain("EDIT_UNLOCK_PRICE_INR");
    // Formal single-color warning boxes (no destructive/red tint).
    expect(goLive).toContain("border border-border bg-muted");
    expect(goLive).toContain("text-muted-foreground");
    expect(goLive).not.toContain("border-destructive");
    expect(goLive).not.toContain("bg-destructive");
  });
});
