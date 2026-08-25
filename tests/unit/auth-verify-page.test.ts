import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("confirm email screen", () => {
  it("keeps Google as the only alternate door and does not send people to the landing sign-in", () => {
    const page = read("src", "app", "(auth)", "verify", "page.tsx");
    const watcher = read("src", "components", "auth", "VerifyWatcher.tsx");

    expect(page).toContain('href="/api/v1/auth/google"');
    expect(page).toContain("Continue with Google");
    expect(page).not.toContain("Sign in with email and password");
    expect(page).not.toContain("/?mode=signin");

    expect(watcher).toContain('router.replace("/")');
    expect(watcher).not.toContain('router.replace("/new")');
    expect(watcher).toContain('href="/signin"');
  });
});
