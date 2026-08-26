import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("choosing a template", () => {
  it("asks for the business facts before opening the editor", () => {
    const button = read("src", "components", "discovery", "UseDesignButton.tsx");
    const capture = read("src", "components", "discovery", "IntentCapture.tsx");
    const page = read("src", "app", "new", "page.tsx");

    expect(button).toContain("/new?template=");
    expect(button).not.toContain("/editor/");
    expect(page).toContain("sourceTemplateId");
    expect(page).toContain("add About, Contact and Settings");
    expect(capture).toContain("startFromDesign");
    expect(capture).toContain("Put this on the design");
    expect(capture).toContain("paidPlan");
    expect(capture).toContain('router.push("/plans")');
    expect(page).toContain("paidPlan");
    expect(capture).toContain("/generate");
    expect(capture).toContain("/editor/");
    expect(capture).toContain("?job=");
    expect(capture).toContain("visual reference");
    expect(capture).toContain("LockedPlanNotice");

    const fromDesign = capture.slice(
      capture.indexOf("async function startFromDesign"),
      capture.indexOf("async function startGeneration"),
    );
    expect(fromDesign).toContain("`/editor/${encodeURIComponent(created.data.id)}`");
    expect(fromDesign).not.toContain("/generate");
    expect(fromDesign).not.toContain("/choose/");
    expect(fromDesign).not.toContain("visual reference");

    const fromScratch = capture.slice(capture.indexOf("async function startGeneration"));
    expect(fromScratch).toContain("/generate");
    expect(fromScratch).toContain("/choose/");
  });

  it("keeps the editor as chat on the left and live preview on the right", () => {
    const shell = read("src", "components", "editor", "EditorShell.tsx");
    const split = read("src", "components", "editor", "EditorSplit.tsx");

    // Default (non-advanced) layout: chat left, preview right.
    const defaultSplit = shell.slice(
      shell.indexOf("left={loading ? <PaneSkeleton /> : <ChatPanel"),
    );

    expect(defaultSplit.indexOf("<ChatPanel")).toBeGreaterThanOrEqual(0);
    expect(defaultSplit.indexOf("<PreviewPane")).toBeGreaterThan(defaultSplit.indexOf("<ChatPanel"));
    expect(shell.includes("ContentPanel")).toBe(false);
    expect(split).toContain("DEFAULT_LEFT = 30");
    expect(split).toContain("role=\"separator\"");
  });
});
