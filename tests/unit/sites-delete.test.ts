import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("deleting a site", () => {
    it("offers delete on the dashboard card", () => {
        const card = read("src", "components", "dashboard", "SiteCard.tsx");
        expect(card).toContain("DeleteSiteButton");
        expect(card).toContain("onDeleted");
    });

    it("asks for the same email and password as sign-in before the row is removed", () => {
        const dialog = read("src", "components", "dashboard", "DeleteSiteDialog.tsx");
        const route = read("src", "app", "api", "v1", "projects", "[id]", "route.ts");
        const login = read("src", "app", "api", "v1", "auth", "login", "route.ts");

        expect(dialog).toContain("Forgot your password?");
        expect(dialog).toContain("/api/v1/auth/password/reset");
        expect(dialog).toContain("That email and password do not match. Try again, or reset your password.");
        expect(dialog).toContain("credentialsSchema");
        expect(dialog).toContain("method = \"POST\"");
        expect(dialog).toContain('"DELETE"');

        expect(route).toContain("authenticateWithPassword");
        expect(route).toContain("readCredentials");
        expect(login).toContain("authenticateWithPassword");
        expect(login).toContain("readCredentials");
    });

    it("reuses the sign-in reset page rather than a second password flow", () => {
        const reset = read("src", "app", "api", "v1", "auth", "password", "reset", "route.ts");
        const form = read("src", "components", "auth", "ResetPasswordForm.tsx");
        const dialog = read("src", "components", "dashboard", "DeleteSiteDialog.tsx");

        expect(reset).toContain("resetPasswordForEmail");
        expect(form).toContain("/api/v1/auth/password/update");
        expect(dialog).toContain("/api/v1/auth/password/reset");
        expect(dialog).toContain("Send Reset Link");
        expect(dialog).toContain("Check your email");
    });
});
