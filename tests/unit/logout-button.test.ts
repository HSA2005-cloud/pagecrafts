import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("log out", () => {
  it("posts to the logout route and leaves the session", () => {
    const button = read("src", "components", "auth", "LogoutButton.tsx");
    const header = read("src", "components", "landing", "SiteHeader.tsx");
    const menu = read("src", "components", "settings", "ProfileMenu.tsx");
    const route = read("src", "app", "api", "v1", "auth", "logout", "route.ts");
    const settings = read("src", "app", "settings", "page.tsx");

    expect(button).toContain('fetch("/api/v1/auth/logout"');
    expect(button).toContain('method: "POST"');
    expect(button).toContain('window.location.href = "/"');
    expect(button).toContain("Log out");
    expect(button).toContain("cursor-pointer");
    expect(header).toContain("<ProfileMenu");
    expect(menu).toContain("<LogoutButton");
    expect(menu).toContain('href="/?slide=settings"');
    expect(settings).toContain('redirect("/?slide=settings")');
    expect(route).toContain("signOut");
  });
});
