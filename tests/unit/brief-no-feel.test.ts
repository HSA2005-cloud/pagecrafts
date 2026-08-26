import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { emptyBrief } from "@/lib/ai/generate/brief";

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8");

describe("brief feel tones removed", () => {
  it("does not show How should it feel / Simple Warm Bold on the brief form", () => {
    const fields = read("src", "components", "discovery", "BriefFields.tsx");
    expect(fields).not.toContain("How should it feel?");
    expect(fields).not.toContain("BRIEF_TONES");
    expect(fields).not.toContain('"Simple"');
    expect(fields).not.toContain('"Warm"');
    expect(fields).not.toContain('"Bold"');
  });

  it("drops tone from the site brief model", () => {
    const brief = read("src", "lib", "ai", "generate", "brief.ts");
    expect(brief).not.toContain("BRIEF_TONES");
    expect(brief).not.toContain("BriefTone");
    expect(brief).not.toContain("TONE_LINE");
    expect(brief).not.toMatch(/\btone\b/);
    expect(emptyBrief()).not.toHaveProperty("tone");
  });
});
