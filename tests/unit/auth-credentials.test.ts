import { describe, it, expect } from "vitest";
import { credentialsIssue, credentialsSchema, MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";

describe("credentialsIssue", () => {
    it("asks for an email when it is missing", () => {
        expect(credentialsIssue({ email: "", password: "long-enough-password" }))
            .toBe("Enter your email address.");
    });

    it("rejects an address that is not an email", () => {
        expect(credentialsIssue({ email: "not-an-email", password: "long-enough-password" }))
            .toBe("Enter a valid email address.");
    });

    it("asks for a password when it is missing", () => {
        expect(credentialsIssue({ email: "me@example.com", password: "" }))
            .toBe("Enter your password.");
    });

    it("rejects a password that is too short", () => {
        expect(credentialsIssue({ email: "me@example.com", password: "short" }))
            .toBe(`Password must be between ${MIN_PASSWORD_LENGTH} and 128 characters.`);
    });

    it("returns null for a valid pair", () => {
        expect(credentialsIssue({ email: "me@example.com", password: "long-enough-password" }))
            .toBeNull();
    });

    it("lowercases the email on parse", () => {
        expect(credentialsSchema.parse({
            email: "Me@Example.COM",
            password: "long-enough-password",
        }).email).toBe("me@example.com");
    });
});
