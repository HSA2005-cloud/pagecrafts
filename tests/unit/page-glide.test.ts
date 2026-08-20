import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("page glides", () => {
    it("keeps the live preview on screen while the three looks slide in", () => {
        const chooser = read("src", "components", "discovery", "StyleChooser.tsx");
        expect(chooser).toContain("stage-glide-out");
        expect(chooser).toContain("stage-glide-in");
        expect(chooser).toContain("holdingLive");
        expect(chooser).toContain("GeneratingOverlay");
        expect(chooser).toContain("Pick a");
    });

    it("glides editor and choose with the rest of the funnel", () => {
        const flow = read("src", "components", "site", "PageFlow.tsx");
        expect(flow).toContain('"/editor"');
        expect(flow).toContain("page-glide-out");
        expect(flow).toContain("GLIDE_MS");
        expect(flow).not.toContain('path.startsWith("/editor")) return -1');
    });

    it("uses a two-panel glide rather than a 10% fade-in", () => {
        const css = read("src", "app", "globals.css");
        expect(css).toContain("glide-in-forward");
        expect(css).toContain("glide-out-forward");
        expect(css).toContain("stage-glide-out");
        expect(css).toContain("prefers-reduced-motion");
    });

    it("sends a finished editor job to the three looks, not a hard cut into the editor", () => {
        const shell = read("src", "components", "editor", "EditorShell.tsx");
        expect(shell).toContain("`/choose/${encodeURIComponent(projectId)}?job=");
        expect(shell).toContain("GeneratingOverlay");
    });
});
