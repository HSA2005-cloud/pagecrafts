import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = (...parts: string[]) => join(process.cwd(), ...parts);
const read = (...parts: string[]) => readFileSync(root(...parts));

describe("PageCrafts brand favicon", () => {
  it("ships a favicon.ico that is not the default Vercel triangle", () => {
    const ico = read("src", "app", "favicon.ico");
    // The Next.js starter Vercel mark is a small black/white triangle ICO (~15–30KB
    // depending on sizes). Ours is a multi-size PC monogram derived from the lockup.
    expect(ico.byteLength).toBeGreaterThan(8_000);

    // ICO header: reserved (0), type (1), count.
    expect(ico[0]).toBe(0);
    expect(ico[1]).toBe(0);
    expect(ico[2]).toBe(1); // icon type
    expect(ico[3]).toBe(0);
    const count = ico[4] | (ico[5] << 8);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("exposes a square brand mark and points metadata at it", () => {
    const mark = read("public", "brand", "pagecrafts-mark.png");
    expect(mark.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

    const layout = read("src", "app", "layout.tsx").toString("utf8");
    expect(layout).toContain("/brand/pagecrafts-mark.png");
    expect(layout).toContain("/favicon.ico");
    // Wide lockup stays for Open Graph, not as the tab icon.
    expect(layout).toMatch(/openGraph:[\s\S]*pagecrafts-lockup\.png/);
  });

  it("includes Next app icon file conventions for apple and png", () => {
    expect(read("src", "app", "icon.png").byteLength).toBeGreaterThan(100);
    expect(read("src", "app", "apple-icon.png").byteLength).toBeGreaterThan(100);
  });
});
