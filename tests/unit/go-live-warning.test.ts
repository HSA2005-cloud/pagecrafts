import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("Go Live warning", () => {
  it("warns that the free publish is one chance and edits lock after live", () => {
    const goLive = read("src", "components", "editor", "GoLiveButton.tsx");

    expect(goLive).toContain("Publish once — then edits are locked");
    expect(goLive).toContain("One chance:");
    expect(goLive).toContain("once this website is live, you cannot make changes");
    expect(goLive).toContain("I understand — continue");
    expect(goLive).toContain("Choose a Custom Domain");
    expect(goLive).toContain("I already have a domain");
    expect(goLive).toContain("Publish on PageCrafts");
    expect(goLive).toContain("domain-connect");
    expect(goLive).toContain("EDIT_UNLOCK_PRICE_INR");
    expect(goLive).toContain("border border-border bg-muted");
    expect(goLive).toContain("text-muted-foreground");
    expect(goLive).not.toContain("border-destructive");
    expect(goLive).not.toContain("bg-destructive");
  });

  it("keeps custom domain inside Go Live, not the chat banner", () => {
    const goLive = read("src", "components", "editor", "GoLiveButton.tsx");
    const composer = read("src", "components", "editor", "ChatComposer.tsx");

    expect(goLive).toContain("/api/v1/domains/suggest");
    expect(goLive).toContain("openDomainCheckout");
    expect(composer).not.toContain("Set up a custom domain");
    expect(composer).not.toContain("CustomDomainDialog");
  });
});
