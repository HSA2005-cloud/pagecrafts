"use client";

import { useState } from "react";

import type { AccountResponse } from "@/lib/contracts";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";

export function AccountPanel({ account }: { account: AccountResponse }) {
  const [displayName, setDisplayName] = useState(account.displayName);
  const [nameState, setNameState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordState, setPasswordState] = useState<"idle" | "saving" | "saved" | "failed">(
    "idle",
  );
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setNameState("saving");
    try {
      const response = await fetch("/api/v1/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          phone: account.phone,
          billingLine: account.billingLine,
          billingCity: account.billingCity,
          billingState: account.billingState,
          billingPostal: account.billingPostal,
          billingCountry: account.billingCountry,
          gstin: account.gstin,
        }),
      });
      if (!response.ok) throw new Error("refused");
      setNameState("saved");
    } catch {
      setNameState("failed");
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      setPasswordState("failed");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Both passwords need to match.");
      setPasswordState("failed");
      return;
    }

    setPasswordState("saving");
    try {
      const response = await fetch("/api/v1/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, password, confirmPassword }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: { message?: string };
      };
      if (!response.ok || !body?.ok) {
        setPasswordState("failed");
        setPasswordError(body?.error?.message ?? "Could not change that password. Try again.");
        return;
      }
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setPasswordOpen(false);
      setPasswordState("saved");
    } catch {
      setPasswordState("failed");
      setPasswordError("Could not change that password. Try again.");
    }
  }

  return (
    <div className="rounded-2xl glass-panel p-5">
      <p className="text-base font-semibold text-foreground">Account</p>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
        Sign-in details for this PageCrafts account.
      </p>

      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="text-foreground">{account.email}</dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-muted-foreground">Verified</dt>
          <dd
            className={
              account.emailVerified ? "text-foreground" : "text-muted-foreground"
            }
          >
            {account.emailVerified ? "Yes" : "Not yet — check your inbox"}
          </dd>
        </div>
      </dl>

      <form onSubmit={(event) => void saveName(event)} className="mt-5 border-t border-border/60 pt-5">
        <label className="block text-sm">
          <span className="text-muted-foreground">Name</span>
          <Input
            className="mt-1.5"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setNameState("idle");
            }}
            autoComplete="name"
            placeholder="Your name"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="outline-brand"
            size="sm"
            className="cursor-pointer rounded-lg font-medium"
            disabled={nameState === "saving"}
          >
            {nameState === "saving" ? "Saving…" : "Save name"}
          </Button>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {nameState === "saved"
              ? "Saved."
              : nameState === "failed"
                ? "Could not save just now. Try again."
                : null}
          </p>
        </div>
      </form>

      <div className="mt-5 border-t border-border/60 pt-5">
        <p className="text-sm font-medium text-foreground">Change password</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Use your current password, then choose a new one.
        </p>

        {!passwordOpen ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline-brand"
              size="sm"
              className="cursor-pointer rounded-lg font-medium"
              onClick={() => {
                setPasswordOpen(true);
                setPasswordState("idle");
                setPasswordError(null);
              }}
            >
              Change password
            </Button>
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {passwordState === "saved" ? "Password updated." : null}
            </p>
          </div>
        ) : (
          <form
            onSubmit={(event) => void changePassword(event)}
            className="mt-3 space-y-3 rounded-xl border border-border/60 bg-background/30 p-4"
          >
            <PasswordField
              id="settings-current-password"
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
            />
            <PasswordField
              id="settings-new-password"
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            <PasswordField
              id="settings-confirm-password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                variant="brand"
                size="sm"
                className="cursor-pointer rounded-lg font-semibold"
                disabled={passwordState === "saving"}
              >
                {passwordState === "saving" ? "Updating…" : "Update password"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="cursor-pointer rounded-lg font-medium"
                onClick={() => {
                  setPasswordOpen(false);
                  setCurrentPassword("");
                  setPassword("");
                  setConfirmPassword("");
                  setPasswordError(null);
                  setPasswordState("idle");
                }}
              >
                Cancel
              </Button>
            </div>
            <p aria-live="polite" className="text-xs text-destructive">
              {passwordError}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
