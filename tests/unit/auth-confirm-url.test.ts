import { describe, expect, it } from "vitest";

import { authConfirmUrl, confirmDestination } from "@/lib/auth/confirm-url";

describe("authConfirmUrl", () => {
  it("is the confirm route with no query string", () => {
    expect(authConfirmUrl()).toMatch(/\/api\/v1\/auth\/confirm$/);
    expect(authConfirmUrl()).not.toContain("?");
  });
});

describe("confirmDestination", () => {
  it("uses an explicit next when it is a safe path", () => {
    expect(confirmDestination("signup", "/reset")).toBe("/reset");
    expect(confirmDestination("signup", "https://evil.example")).toBe("/");
  });

    it("sends a recovery link to set a password and a signup link to home", () => {
    expect(confirmDestination("recovery", null)).toBe("/reset");
    expect(confirmDestination("signup", null)).toBe("/");
    expect(confirmDestination("email", undefined)).toBe("/");
  });
});
