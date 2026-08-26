import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("template detail modal device frames", () => {
  it("shows the phone preview as a portrait handset, not a landscape tile", () => {
    const modal = read("src", "components", "discovery", "TemplateDetailModal.tsx");

    expect(modal).toContain('label: "Phone"');
    expect(modal).toContain('orientation: "portrait"');
    expect(modal).toContain("PORTRAIT_ASPECT");
    expect(modal).toContain("PORTRAIT_BASE_WIDTH");
    expect(modal).toContain("orientation={orientation}");
    expect(modal).toMatch(/PORTRAIT_ASPECT\s*=\s*19\.5\s*\/\s*9/);
    // Phone frame must stay smaller than tablet (and much smaller than desktop).
    expect(modal).toMatch(/label:\s*"Phone",\s*width:\s*72/);
    expect(modal).toMatch(/label:\s*"Tablet",\s*width:\s*180/);

    const preview = read("src", "components", "discovery", "TemplatePreview.tsx");
    expect(preview).toContain('orientation = "landscape"');
    expect(preview).toContain("aspect-9/19.5");
  });
});
