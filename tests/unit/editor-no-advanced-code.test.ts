import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("editor code access", () => {
  it("does not offer Advanced file/code browsing to customers", () => {
    const top = read("src", "components", "editor", "TopBar.tsx");
    const shell = read("src", "components", "editor", "EditorShell.tsx");

    expect(top).not.toContain("Advanced");
    expect(top).not.toContain("toggleAdvanced");
    expect(shell).not.toContain("<FileTree");
    expect(shell).not.toContain("<CodePane");
    expect(shell).toContain("<ChatPanel");
    expect(shell).toContain("<PreviewPane");
  });
});
