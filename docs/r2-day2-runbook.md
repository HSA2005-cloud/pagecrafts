# R2 · Day 2 — build runbook

**Owner:** Pragna (R2 · Discovery + Templates)
**Day 2 of 20.** Three blocks, 09:00–18:00.
**Schedule source:** *Pragna (R2 · Discovery + Templates) — Detailed Schedule v1.2*, row block D2.
**Auth model:** email + password (Amendment A2 — supersedes the magic-link INVARIANT in PRD §2.6).

| Time | Block | What lands |
|---|---|---|
| 09:00–10:30 | Landing structure | Screen 01 built from Day-1 tokens: hero, value props, one CTA |
| 10:30–13:00 | Landing polish + responsive | Works at 380 / 768 / 1280; images optimised; Lighthouse measured |
| 14:00–18:00 | **Auth entry (email + password)** | Sign-up, sign-in, email verification, password reset |
| — | ~~Templates (sourcing kickoff)~~ | **Moved to Day 3** — see the note at the end |

> Two things changed from version 1.0 of this runbook. Amendment A1 removed the GitHub door, and Amendment A2 replaced the magic link with email + password. The auth block now runs four hours instead of two, because passwords drag two more flows in with them, and template sourcing moves to Day 3 to pay for it.

---

## Before you start

Run these from the repository root — `...\Projects\pagecrafts\pagecrafts`, the folder that contains `package.json`. There is no second `pagecrafts` folder inside it.

```bash
git checkout main
git pull origin main
git checkout -b discovery/landing-and-password-auth
```

Branch naming is from the Git Workflow doc (B-1): `<area>/<short-description>`, `discovery/` is your prefix. Branches live under two working days — this one closes tonight.

### Clear two warnings first (5 minutes)

**1. A stray lockfile outside the repo.** `next dev` reports:

> *Next.js ignored package-lock.json in `...\Projects\pagecrafts` because it is outside the current Git repository.*

There is an empty 89-byte `package-lock.json` sitting in the parent folder, left over from an early `npm` run in the wrong directory. It contains no packages and nothing depends on it. Delete it:

```powershell
Remove-Item ..\package-lock.json
```

The alternative — setting `turbopack.root` in `next.config.ts` — tells Turbopack to treat the parent as the project root, which is the opposite of what you want. Delete the stray file.

**2. `middleware.ts` is deprecated in Next 16.** The warning says to use `proxy` instead. This one matters to you today rather than eventually: `src/middleware.ts` is what refreshes the Supabase session cookie on every request, and everything you build this afternoon — staying signed in after sign-up, the recovery link producing a usable session — depends on it running. Rename it now, while the file is forty lines and nothing else has been built on top:

```bash
npx @next/codemod@canary middleware-to-proxy .
```

That renames `src/middleware.ts` to `src/proxy.ts` and the exported `middleware` function to `proxy`. The `config.matcher` export is unchanged. Restart `npm run dev` and confirm the warning is gone and you can still load `/`.

If you would rather not run a codemod, do it by hand — rename the file and rename the one exported function. It is the same two edits.

### Then start the dev server

```bash
npm run dev
```

Open http://localhost:3000. You should still see the create-next-app placeholder. That is what you replace first.

### Three defects to fix or flag this morning

These are real, they are in the repo now, and two of them will stop you at 14:00 if you leave them.

**1. `src/lib/auth/session.ts` reads an environment variable that does not exist.** Line 10 asks for `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Every other file — `config/env.ts`, `auth/server.ts`, `middleware.ts` — uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. So `supabaseRoute()` is built with `undefined` as its key, and that is the client the `withRoute` kernel uses on **every** persistence route in R3. Fix it:

In `src/lib/auth/session.ts`, the key argument becomes:

```ts
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
```

While you are in that file: it contains two separate Supabase client factories (`supabaseRoute` and, further down, `supabaseRouteClient` imported from `auth/server.ts`) and a stray mid-file `import` block. Worth a tidy, but the env var is the bug.

**2. `.env.example` is missing everything Supabase.** `config/env.ts` requires four variables and the example file lists none of them. Add:

```bash
# --- app ---
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- supabase (Adithya) ---
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`NEXT_PUBLIC_APP_URL` is not optional today — the verification and password-reset emails need an absolute URL to send people back to.

**3. Two error modules disagree.** `src/lib/errors/api-result.ts` and `src/lib/errors/respond.ts` both export `ok` / `fail`, and they map `spend_capped` differently: 429 in one, 402 in the other. API Design §7 says 429. NFR-043 says a shared contract is declared once. Pick `respond.ts` (the kernel already uses it), fix the status, delete the duplicate — or raise it with E1 if the kernel is his call.

---

## Block 1 · 09:00–10:30 — Landing structure

### Why we are doing this

Screen 01 is the first thing every user meets and the top of the funnel PostHog measures (`EV-01 landing_viewed`). Two rules govern it:

- **FR-001** — every screen is built from the shared design system, with no screen-specific style forks. You wrote those tokens yesterday; today is the first real test of whether they hold.
- **Consumer-tool framing** — the reader is a bakery owner, not a developer. If a word would make her pause, it does not ship.

### Where the file goes, and one gotcha

The repository layout (Appendix A of the Module Breakdown, as corrected by the v2.1 errata) puts screen 01 at:

```
src/app/(auth)/page.tsx        ← screen 01, module M1.2
```

`(auth)` in parentheses is a **route group**. Next.js uses the folder to organise files but strips it from the URL, so `src/app/(auth)/page.tsx` serves `/`. It exists so screen 01 and its sibling auth screens sit together without the URL becoming `/auth`.

**The gotcha:** you already have `src/app/page.tsx`. If you create `src/app/(auth)/page.tsx` and leave the old one, two files resolve to `/` and Next.js throws a duplicate-route error at build. Delete the old one.

### Steps

**1. Move the route.**

```bash
mkdir -p "src/app/(auth)"
git rm src/app/page.tsx
```

**2. Create `src/components/landing/Hero.tsx`.**

```tsx
export function Hero() {
  return (
    <section className="w-full px-6 pt-20 pb-14 sm:pt-28 sm:pb-20">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Describe it. Publish it. It&apos;s yours.
        </h1>
        <p className="max-w-xl text-lg leading-8 text-muted-foreground">
          Tell us what you want and we build the website. Change anything just by
          asking. When you like it, one tap puts it online at your own address.
        </p>
        <a
          href="#sign-in"
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Start building — free
        </a>
        <p className="text-sm text-muted-foreground">
          Building and editing are free. You pay Rs 249 only when you are ready to
          go live.
        </p>
      </div>
    </section>
  );
}
```

Two things worth noticing:

- Every colour is a token — `bg-primary`, `text-muted-foreground`, `ring-ring`. No hex values, no `bg-indigo-600`. That is FR-001, and it is why swapping the brand colour later is one line in `globals.css` instead of a search across fifteen screens.
- The price line is on the landing page on purpose. UI Spec §7.18 commits to *"prices, in rupees, are shown before any choice, never after."* Telling someone about a fee after they have spent twenty minutes building is the thing that makes people feel tricked.

**3. Create `src/components/landing/ValueProps.tsx`.**

```tsx
import { Card, CardContent, CardTitle } from "@/components/ui/card";

const PROPS = [
  {
    title: "Never a technical word",
    body: "No code, no accounts to connect, nothing to install. You describe what you want in plain English.",
  },
  {
    title: "You stay in charge",
    body: "Every change is shown to you first, and a version is saved before it happens. You cannot lose your work by exploring.",
  },
  {
    title: "A real site, at a real address",
    body: "Publishing gives you a live website we host and renew for you. It is yours, and it lasts.",
  },
];

export function ValueProps() {
  return (
    <section className="w-full px-6 pb-16">
      <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
        {PROPS.map((p) => (
          <Card key={p.title} className="h-full">
            <CardContent className="flex flex-col gap-2 p-6">
              <CardTitle className="text-base">{p.title}</CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">{p.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
```

Those three claims are not marketing invention — they are the four promises in UI Spec §7.18, written in the customer's language. Keep them honest; if the product stops doing one, the copy changes.

**4. Create a placeholder `src/app/(auth)/page.tsx`.** The sign-in card is added in the 14:00 block; for now just get the page rendering.

```tsx
import { Hero } from "@/components/landing/Hero";
import { ValueProps } from "@/components/landing/ValueProps";

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col items-center">
      <Hero />
      <ValueProps />
    </main>
  );
}
```

Note there is no `"use client"` on any of these. In the App Router, components are **Server Components by default** — they render to HTML on the server and ship no JavaScript to the browser. For static marketing content that is free performance, and it is a large part of how you hit the first-paint target in the next block. You only opt into `"use client"` when you need state or event handlers, which is exactly what the auth card will need and these do not.

### Tools used, and why

| Tool | Why it is here |
|---|---|
| Next.js App Router route groups | Folder in parentheses groups screen 01's files without changing the URL, matching the layout the whole team agreed on |
| React Server Components | Marketing content ships as HTML with zero JS — the cheapest possible first paint |
| Tailwind v4 `@theme` tokens (Day 1) | One vocabulary of colours and spacing across all 15 screens (FR-001) |
| shadcn/ui `Card` (already in the repo) | You are assembling, not hand-rolling; consistent focus rings and radii come for free |

### Acceptance for this block

- `npm run dev` → `/` renders the new landing, and no create-next-app content survives anywhere.
- The CTA is the single most prominent action on the page.
- Resize to 380 px: no horizontal scrolling.

---

## Block 2 · 10:30–13:00 — Landing polish + responsive

### Why we are doing this

NFR-001 sets the bar: first meaningful paint under 1.5 seconds on a mid-range phone over throttled 4G. That target is written against the gallery, but the landing is the page that decides whether anyone reaches the gallery, so it holds itself to the same standard. N-3 requires discovery to be usable from 380 px upward.

Meera meets this product on a phone. If it is slow or broken there, nothing else you build this month matters.

### Steps

**1. Check the three widths.** Chrome DevTools → device toolbar (Ctrl+Shift+M) → set width manually to 380, then 768, then 1280.

Tailwind is mobile-first: unprefixed classes apply everywhere, and `sm:` / `md:` / `lg:` add on at wider widths. So `grid gap-4 sm:grid-cols-3` means *one column on a phone, three from 640 px up*. If you find yourself writing `sm:grid-cols-1` you have the mental model backwards.

What to look for at 380 px: no horizontal scrollbar, no clipped text, tap targets at least 44 px tall, headline no more than about three lines.

**2. Fix the page metadata.** `src/app/layout.tsx` still says "Create Next App". Replace it:

```tsx
export const metadata: Metadata = {
  title: "PageCraft — describe it, publish it, it's yours",
  description:
    "Build a real website by describing it. No code, nothing to install. Free to build; Rs 249 to go live.",
};
```

This is also groundwork for S-3 (site metadata and social preview tags), which lands properly on D8.

**3. Add imagery through `next/image`, not `<img>`.**

```tsx
import Image from "next/image";

<Image
  src="/landing/hero.png"
  alt="A bakery website built in PageCraft"
  width={1200}
  height={750}
  priority
  className="rounded-lg border border-border"
/>
```

Why `next/image` rather than a plain `<img>`:

- It serves modern formats (AVIF, WebP) at the right size for the device, instead of pushing a 1 MB PNG to a phone.
- `width` and `height` reserve the space before the image arrives, so the page does not jump as it loads. That jump is measured as Cumulative Layout Shift and Lighthouse penalises it.
- Images below the fold are lazy-loaded automatically.

`priority` goes on **one** image only — the largest one visible without scrolling. It tells Next.js to preload it because it is almost certainly the Largest Contentful Paint element. Putting `priority` on everything makes everything slower.

**4. Fonts are already handled.** `layout.tsx` uses `next/font` (Geist). That self-hosts the font files and inlines the CSS, so there is no render-blocking request to Google's servers and no flash of unstyled text. Leave it alone; just know why it is there.

**5. Measure properly.**

```bash
npm run build
npm start
```

Then Lighthouse on http://localhost:3000 → Mode: Navigation, Device: **Mobile**, throttling Slow 4G.

**Measure the production build, never `npm run dev`.** The dev server skips minification, ships source maps and recompiles on the fly. A Lighthouse score from `next dev` is meaningless and will flatter you by a wide margin.

**6. Write the number down** in the pull request. NFR-001 is a number, not a vibe, and on D6 you have to hit under 1.5 s on the gallery with real thumbnails. Knowing today's baseline tells you how much headroom you have.

### Tools used, and why

| Tool | Why it is here |
|---|---|
| `next/image` | Automatic format and size negotiation, lazy loading, reserved space so nothing jumps |
| `next/font` | Self-hosted fonts, no third-party request, no layout shift |
| Chrome DevTools device toolbar | Cheapest way to see 380 px honestly; the responsive bug you cannot see is the one that ships |
| Lighthouse, mobile + Slow 4G | The measurement NFR-001 is written in. Any other configuration answers a different question |

### Acceptance for this block

- No horizontal scroll at 380 px; layout sensible at 768 and 1280.
- Every image has explicit `width` and `height`; exactly one has `priority`.
- Lighthouse mobile run on a production build recorded in the PR.

---

## Block 3 · 14:00–18:00 — Auth entry (email + password)

### Why this block is four hours

You chose email and password over the magic link. That is a legitimate product decision — passwords are what people expect, and magic-link deliverability is a genuine single point of failure — and it is recorded in **Amendment A2**, which supersedes PRD §2.6 INVARIANT 8 and SEC-01. Nothing below works around the specification; the specification moved.

But passwords are never just a password field. They drag in three things the magic link did not need, and all three are load-bearing:

1. **Password reset.** Non-negotiable. People forget passwords on day one. And the reset works by emailing a link — so you build the email-link machinery anyway, just for a worse reason than signing in with it.
2. **Email verification.** With a magic link, holding the inbox *is* the proof. With a password, anyone can sign up as `someone-else@gmail.com`. A-7 links accounts on a **verified** email, and `users.email_verified` already exists in your schema, so an unverified account cannot be trusted to be who it says it is.
3. **Brute-force protection.** A magic link has no secret to guess. A password does. N-2 and C-10 require limits to be server-side and atomic.

That is why this block runs to 18:00 and template sourcing moves to Day 3.

### Set up Supabase first (10 minutes)

In your Supabase project dashboard:

- **Authentication → Providers → Email** — make sure Email is enabled and **"Confirm email" is ON**. This is what makes verification real rather than decorative.
- **Authentication → Emails → SMTP** — point it at Resend, SendGrid, or Amazon SES. The built-in sender is rate-limited and confirmation mail often never arrives. `npm run auth:email` prints the values from `SMTP_PROVIDER` / `SMTP_PASS` / `SMTP_ADMIN_EMAIL`.
- **Authentication → URL Configuration** — set Site URL to `{APP_URL}` and add `{APP_URL}/api/v1/auth/confirm` to Redirect URLs (include the `?next=/new` and `?next=/reset` variants; the allow-list is exact). Without this, every confirmation and reset link bounces. Locally this list lives in `supabase/config.toml` and is applied on `supabase start`.
- Copy the project URL and the publishable key into your local `.env.local`.

### What already exists, and what you are adding

Your Day-1 work left the backend most of the way there. Take stock before you type:

| Already built | Where |
|---|---|
| `credentialsSchema` — email + password, 10–128 chars | `src/lib/auth/credentials.ts` |
| `POST /api/v1/auth/signup` — returns 201 with a session, or 202 `{pending:true}` when confirmation is required | `src/app/api/v1/auth/signup/route.ts` |
| `POST /api/v1/auth/login` — 200 with the user, or 401 with a deliberately generic message | `src/app/api/v1/auth/login/route.ts` |
| `POST /api/v1/auth/logout`, `GET /api/v1/auth/me` | same folder |
| `SessionUser` with `emailVerified` | `src/lib/auth/session.ts` |
| Session refresh on every request | `src/middleware.ts` |

You are adding: four routes, four components, three pages.

### Step 1 — form contracts (`src/lib/contracts/auth.ts`)

```ts
import { z } from "zod";
import {
  credentialsSchema,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@/lib/auth/credentials";

// Sign-up adds a confirmation field. The email and password rules themselves are NOT
// redeclared here — they are imported from the one place they live (C-11, NFR-043).
export const signUpFormSchema = credentialsSchema
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Both passwords need to match.",
  });

export const passwordResetRequestSchema = z.object({
  email: credentialsSchema.shape.email,
});

export const passwordUpdateSchema = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export type SignUpForm = z.infer<typeof signUpFormSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordUpdate = z.infer<typeof passwordUpdateSchema>;
```

Add `export * from "./auth";` to `src/lib/contracts/index.ts`.

Notice what this file does **not** do: it never restates the email rule or the password length. It reaches into `credentialsSchema.shape.email` and imports the constants. One schema, one source of truth — that is C-11, and it is why changing the minimum password length later is one edit rather than four.

### Step 2 — the reset-request route

`src/app/api/v1/auth/password/reset/route.ts`

```ts
import "server-only";
import type { NextRequest } from "next/server";
import { supabaseRouteClient } from "@/lib/auth/server";
import { passwordResetRequestSchema } from "@/lib/contracts/auth";
import { publicEnv } from "@/lib/config/env";
import { ok, fail, unexpected } from "@/lib/errors/api-result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = passwordResetRequestSchema.safeParse(json);

  if (!parsed.success) {
    return fail("validation_failed", "Enter a valid email address.");
  }

  try {
    const supabase = await supabaseRouteClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${publicEnv.appUrl}/api/v1/auth/confirm?next=/reset`,
    });
    // SEC-05: the same answer whether or not this address has an account.
    // Never let a caller learn who is registered by watching the response.
    return ok({ status: "accepted" as const }, 202);
  } catch (error) {
    return unexpected(error);
  }
}
```

The `redirectTo` points at your own confirm route, not straight at `/reset`. That is deliberate — the link carries a one-time token that has to be exchanged for a session on the server before the user can set a new password.

### Step 3 — the confirm route (handles both verification and recovery)

`src/app/api/v1/auth/confirm/route.ts`

```ts
import "server-only";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One route for every emailed link. Supabase sends `token_hash` and a `type`
// ("signup" for confirmation, "recovery" for a password reset); verifyOtp trades
// that token for a real session cookie, then we send the user where they were going.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/new";

  if (!tokenHash || !type) {
    redirect("/?error=expired");
  }

  const supabase = await supabaseRouteClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    redirect("/?error=expired");
  }

  redirect(next);
}
```

One route serves both flows because the mechanics are identical — a single-use token exchanged for a session. Only the destination differs.

`redirect()` from `next/navigation` throws internally to stop execution, which is why there is no `return` after it and why TypeScript does not complain about the code below.

### Step 4 — the password-update route

`src/app/api/v1/auth/password/update/route.ts`

```ts
import "server-only";
import type { NextRequest } from "next/server";
import { supabaseRouteClient } from "@/lib/auth/server";
import { passwordUpdateSchema } from "@/lib/contracts/auth";
import { toSessionUser } from "@/lib/auth/session";
import { ok, fail, unexpected } from "@/lib/errors/api-result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = passwordUpdateSchema.safeParse(json);

  if (!parsed.success) {
    return fail("validation_failed", "Choose a password of at least 10 characters.");
  }

  try {
    const supabase = await supabaseRouteClient();

    // The recovery link established a session. No session means the link expired,
    // was already used, or somebody is calling this route directly.
    const { data: sessionData } = await supabase.auth.getUser();
    if (!sessionData.user) {
      return fail("unauthorized", "That reset link has expired. Ask for a new one.");
    }

    const { data, error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error || !data.user) {
      return fail("validation_failed", "That password was not accepted. Try a different one.");
    }

    return ok({ user: toSessionUser(data.user) });
  } catch (error) {
    return unexpected(error);
  }
}
```

The `getUser()` check is the security gate. Without it this route would let anyone set anyone's password.

### Step 5 — the resend-verification route

`src/app/api/v1/auth/verify/resend/route.ts`

```ts
import "server-only";
import type { NextRequest } from "next/server";
import { supabaseRouteClient } from "@/lib/auth/server";
import { passwordResetRequestSchema } from "@/lib/contracts/auth";
import { publicEnv } from "@/lib/config/env";
import { ok, fail, unexpected } from "@/lib/errors/api-result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = passwordResetRequestSchema.safeParse(json);

  if (!parsed.success) {
    return fail("validation_failed", "Enter a valid email address.");
  }

  try {
    const supabase = await supabaseRouteClient();
    await supabase.auth.resend({
      type: "signup",
      email: parsed.data.email,
      options: { emailRedirectTo: `${publicEnv.appUrl}/api/v1/auth/confirm?next=/new` },
    });
    return ok({ status: "accepted" as const }, 202);
  } catch (error) {
    return unexpected(error);
  }
}
```

Same SEC-05 discipline: always 202, never a hint about whether that address exists.

### Step 6 — the password field (`src/components/auth/PasswordField.tsx`)

Used in three places, so build it once.

```tsx
"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  describedBy?: string;
  invalid?: boolean;
}

export function PasswordField({
  id, label, value, onChange, autoComplete, describedBy, invalid,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative mt-1.5">
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="pr-10"
          required
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </button>
      </div>
    </div>
  );
}
```

The details that matter:

- **`autoComplete="new-password"` vs `"current-password"`** — this is how the browser knows to *offer to generate and save* a password on sign-up, and to *fill* it on sign-in. Get it wrong and password managers behave strangely, which is a top cause of sign-in abandonment.
- **The show/hide toggle** is `type="button"`. A bare `<button>` inside a `<form>` defaults to `type="submit"` — leave it off and clicking the eye submits the form.
- **`aria-label` and `aria-pressed`** on the toggle — it has an icon and no text, so a screen reader has nothing to announce without them (NFR-062).

### Step 7 — the auth card (`src/components/auth/AuthCard.tsx`)

One component, three modes: sign-up, sign-in, forgot-password. A separate page per mode would be three routes and three sets of state for what is, to the user, one small decision.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordField } from "@/components/auth/PasswordField";
import { credentialsSchema, MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";
import { signUpFormSchema, passwordResetRequestSchema } from "@/lib/contracts/auth";
import type { ApiResult, ErrorCode } from "@/lib/contracts";

// Supabase returns a session immediately when "Confirm email" is off, and no session
// with pending:true when it is on. The signup route passes that through, so the UI
// sends the user to the right next screen either way.
interface SignUpData {
  user: { id: string; email: string } | null;
  pending: boolean;
}

type Mode = "signup" | "signin" | "forgot";

// Plain-language copy for every failure this screen can reach (N-4, FR-002).
// A user never sees an ErrorCode; they see a sentence and a way forward.
const MESSAGES: Partial<Record<ErrorCode, string>> = {
  validation_failed: "Check the details above and try again.",
  unauthorized: "That email and password do not match. Try again, or reset your password.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  internal: "Something went wrong on our side. Please try again.",
};

const COPY: Record<Mode, { title: string; blurb: string; action: string }> = {
  signup: {
    title: "Create your account",
    blurb: "Building and editing are free. You only pay when you go live.",
    action: "Create account",
  },
  signin: {
    title: "Welcome back",
    blurb: "Sign in to pick up where you left off.",
    action: "Sign in",
  },
  forgot: {
    title: "Reset your password",
    blurb: "Tell us your email and we will send you a link to set a new password.",
    action: "Send reset link",
  },
};

export function AuthCard({ initialMode = "signup" }: { initialMode?: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setSent(false);
    setPassword("");
    setConfirmPassword("");
  }

  async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json()) as ApiResult<T>;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (mode === "forgot") {
      const parsed = passwordResetRequestSchema.safeParse({ email });
      if (!parsed.success) {
        setError("Enter a valid email address.");
        return;
      }
      setBusy(true);
      const result = await post<unknown>("/api/v1/auth/password/reset", parsed.data).catch(() => null);
      setBusy(false);
      if (result === null) setError(MESSAGES.internal!);
      else setSent(true);
      return;
    }

    if (mode === "signup") {
      const parsed = signUpFormSchema.safeParse({ email, password, confirmPassword });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? MESSAGES.validation_failed!);
        return;
      }
      setBusy(true);
      const result = await post<SignUpData>("/api/v1/auth/signup", {
        email: parsed.data.email,
        password: parsed.data.password,
      }).catch(() => null);
      setBusy(false);

      if (result === null) { setError(MESSAGES.internal!); return; }
      if (!result.ok) { setError(MESSAGES[result.error.code] ?? MESSAGES.internal!); return; }
      router.push(
        result.data.pending
          ? `/verify?email=${encodeURIComponent(parsed.data.email)}`
          : "/new",
      );
      return;
    }

    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    const result = await post<unknown>("/api/v1/auth/login", parsed.data).catch(() => null);
    setBusy(false);

    if (result === null) { setError(MESSAGES.internal!); return; }
    if (!result.ok) { setError(MESSAGES[result.error.code] ?? MESSAGES.internal!); return; }
    router.push("/new");
  }

  if (mode === "forgot" && sent) {
    return (
      <div id="sign-in" className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center" aria-live="polite">
        <h2 className="text-lg font-semibold text-card-foreground">Check your email</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          If there is an account for <span className="font-medium text-foreground">{email}</span>,
          we have sent a link to set a new password. It lasts one hour.
        </p>
        <button type="button" onClick={() => switchTo("signin")} className="mt-4 text-sm font-medium text-primary underline underline-offset-4">
          Back to sign in
        </button>
      </div>
    );
  }

  const copy = COPY[mode];

  return (
    <form id="sign-in" onSubmit={handleSubmit} noValidate className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">{copy.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{copy.blurb}</p>

      <label htmlFor="email" className="mt-5 block text-sm font-medium text-foreground">Email</label>
      <Input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "auth-error" : undefined}
        className="mt-1.5"
        required
      />

      {mode !== "forgot" && (
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          describedBy={mode === "signup" ? "password-hint" : undefined}
          invalid={Boolean(error)}
        />
      )}

      {mode === "signup" && (
        <>
          <p id="password-hint" className="mt-1.5 text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters. A short phrase you will remember works well.
          </p>
          <PasswordField
            id="confirmPassword"
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            invalid={Boolean(error)}
          />
        </>
      )}

      <div aria-live="polite">
        {error && <p id="auth-error" className="mt-3 text-sm text-destructive">{error}</p>}
      </div>

      <Button type="submit" className="mt-5 w-full" disabled={busy}>
        {busy ? "Just a moment…" : copy.action}
      </Button>

      <div className="mt-4 flex flex-col items-center gap-1 text-xs text-muted-foreground">
        {mode === "signin" && (
          <>
            <button type="button" onClick={() => switchTo("forgot")} className="font-medium text-primary underline underline-offset-4">
              Forgot your password?
            </button>
            <span>
              New here?{" "}
              <button type="button" onClick={() => switchTo("signup")} className="font-medium text-primary underline underline-offset-4">
                Create an account
              </button>
            </span>
          </>
        )}
        {mode === "signup" && (
          <span>
            Already have an account?{" "}
            <button type="button" onClick={() => switchTo("signin")} className="font-medium text-primary underline underline-offset-4">
              Sign in
            </button>
          </span>
        )}
        {mode === "forgot" && (
          <button type="button" onClick={() => switchTo("signin")} className="font-medium text-primary underline underline-offset-4">
            Back to sign in
          </button>
        )}
      </div>
    </form>
  );
}
```

The decisions inside it:

- **`"use client"`** — this holds state and handles events, so it runs in the browser. Server Components cannot use `useState`. The directive stays on this file only, so the hero and value props remain server-rendered and ship no JavaScript.
- **`noValidate`** — turns off the browser's own validation bubble so your message is the one shown. Otherwise the user sees two error styles at once.
- **`MESSAGES` maps `ErrorCode` to a sentence** — the server sends a stable machine code, the client owns the human copy. That is the N-4 discipline. When E1's error catalogue (M0.3) is finished, this table moves there so all thirty conditions live in one place.
- **The sign-in failure message never distinguishes "no such account" from "wrong password."** Your login route already returns one generic message; do not undo that in the UI. SEC-05.
- **The reset confirmation says "if there is an account for…"** — same reason. Never confirm that an address is registered.
- **`switchTo` clears the password fields** — a password typed in the wrong mode should not survive the switch.

### Step 8 — the pages

`src/app/(auth)/page.tsx` — replace the placeholder from block 1:

```tsx
import { Hero } from "@/components/landing/Hero";
import { ValueProps } from "@/components/landing/ValueProps";
import { AuthCard } from "@/components/auth/AuthCard";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center">
      <Hero />
      <section className="flex w-full flex-col items-center gap-3 px-6 pb-16">
        {error === "expired" && (
          <p role="status" className="w-full max-w-sm rounded-md border border-border bg-secondary p-3 text-center text-sm text-secondary-foreground">
            That link has expired or was already used. Ask for a new one below.
          </p>
        )}
        <AuthCard />
      </section>
      <ValueProps />
    </main>
  );
}
```

`searchParams` is a Promise in Next 15+ — await it or TypeScript complains.

`src/app/(auth)/verify/page.tsx` — the holding state after sign-up:

```tsx
import { ResendVerification } from "@/components/auth/ResendVerification";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold text-card-foreground">Confirm your email</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          We sent a confirmation link to{" "}
          <span className="font-medium text-foreground">{email ?? "your email address"}</span>.
          Tap it and you are ready to build.
        </p>
        {email && <ResendVerification email={email} />}
        <p className="mt-4 text-xs text-muted-foreground">
          Nothing arrived? Check the spam folder before asking for another.
        </p>
      </div>
    </main>
  );
}
```

`src/components/auth/ResendVerification.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");

  async function resend() {
    setState("busy");
    await fetch("/api/v1/auth/verify/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setState("sent");
  }

  return (
    <div aria-live="polite" className="mt-4">
      {state === "sent" ? (
        <p className="text-sm text-muted-foreground">Sent. Give it a minute, then check again.</p>
      ) : (
        <Button variant="outline" className="w-full" onClick={resend} disabled={state === "busy"}>
          {state === "busy" ? "Sending…" : "Send it again"}
        </Button>
      )}
    </div>
  );
}
```

`src/app/(auth)/reset/page.tsx` and `src/components/auth/ResetPasswordForm.tsx` — where the recovery link lands:

**File: `src/app/(auth)/reset/page.tsx`**

```tsx
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <ResetPasswordForm />
    </main>
  );
}
```

**File: `src/components/auth/ResetPasswordForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/PasswordField";
import { passwordUpdateSchema } from "@/lib/contracts/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";
import type { ApiResult, ErrorCode } from "@/lib/contracts";

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  validation_failed: "Choose a password of at least 10 characters.",
  unauthorized: "That link has expired. Ask for a new one from the sign-in screen.",
  internal: "Something went wrong on our side. Please try again.",
};

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Both passwords need to match.");
      return;
    }
    const parsed = passwordUpdateSchema.safeParse({ password });
    if (!parsed.success) {
      setError(MESSAGES.validation_failed!);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/v1/auth/password/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = (await response.json()) as ApiResult<unknown>;
      if (!result.ok) {
        setError(MESSAGES[result.error.code] ?? MESSAGES.internal!);
        return;
      }
      router.push("/new");
    } catch {
      setError(MESSAGES.internal!);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
      <h1 className="text-lg font-semibold text-card-foreground">Set a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        At least {MIN_PASSWORD_LENGTH} characters. You will use this to sign in from now on.
      </p>

      <PasswordField id="password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" invalid={Boolean(error)} />
      <PasswordField id="confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={Boolean(error)} />

      <div aria-live="polite">
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>

      <Button type="submit" className="mt-5 w-full" disabled={busy}>
        {busy ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
```

### Tools used, and why

| Tool | Why it is here |
|---|---|
| Zod | One schema validates in the browser and again at the route. The browser check is a courtesy; the route check is the enforcement — a `curl` request never runs your React code |
| `ApiResult<T>` envelope | Every route returns `{ok:true,data}` or `{ok:false,error}`, so the client has one branch that handles every failure the system can produce (NFR-114) |
| Supabase Auth | Hashes and stores the password so you never touch a credential directly, and owns the token lifecycle for confirmation and recovery emails |
| React `useState` | Six pieces of local state on one card. Zustand is reserved for the editor's file model (Coding Standard §16.7.2) |
| `lucide-react` | Already a dependency; supplies the show/hide eye icons |
| `next/navigation` `useRouter` / `redirect` | Client-side navigation after a successful submit, server-side redirect out of the confirm route |

**Why not react-hook-form:** it is not in the fixed stack (Coding Standard §16.2.1), shadcn's `Form` wrapper would pull it in as a new dependency, and §16.2.3 says prefer a capability already in the stack. Three fields do not justify it.

### Acceptance for this block

Walk all five paths with a real inbox:

1. **Sign up** with a fresh address → lands on `/verify` → the confirmation email arrives → clicking it lands on `/new` signed in.
2. **Sign up with a password under 10 characters**, or mismatched confirmation → inline message, no request sent.
3. **Sign in** with the confirmed account → `/new`. With a wrong password → the generic message, which is *identical* to the message for an address that has no account.
4. **Forgot password** → "if there is an account…" → the email arrives → the link lands on `/reset` → setting a new password signs you in → the old password no longer works.
5. **An expired or reused link** → lands on `/` with the "that link has expired" banner above the card.

Then the automated checks:

```powershell
# no third-party sign-in control anywhere in the funnel (FR-007, A1 still stands)
Get-ChildItem -Recurse -Include *.ts,*.tsx `
  -Path "src\app\(auth)","src\components\landing","src\components\auth" `
  -ErrorAction SilentlyContinue |
  Select-String -Pattern "github|oauth|continue with|sign in with"
# → must return nothing

npm run typecheck
```

Scope the search to funnel surfaces only. Searching all of `src` would flag `src/lib/github/octokit.ts` and the health route, which legitimately mention GitHub — A1 removed it from the user's view, not from the platform's own infrastructure.

Keyboard only: Tab reaches every field and both toggle links, Enter submits, focus is visible throughout, and the show/hide button announces its state.

### What is deliberately not done today

**Brute-force rate limiting on sign-in.** Your login route maps Supabase's own 429 to `rate_limited`, which is a stopgap, not the control. N-2 and C-10 require per-user and per-IP limits that are server-side and atomic — that is E1's `M7.1` in Upstash, due in week 2. A password door without it is a real exposure and it belongs on the open list, not in your block.

---

## Templates (sourcing kickoff) — moved to Day 3

The 16:00 block is gone from today. Be honest about what that costs, because R2 has no buffer and the template grind is the single most likely way this month fails (risk R1 in the schedule, R-26 in the register).

The cadence is 10 / 18 / 25 by the end of weeks 1 / 2 / 3, and you have **one** template. The plan had you at 3–4 tonight and 6–7 by D4. Losing today means D4 has to climb from 1 to 6–7 in a single two-hour block, which will not happen, and the D5 milestone — *"sign in → pick category → see 10 real templates"* — is what breaks.

**The recommendation:** take D3's 16:00 slot. It currently holds "Intent → gallery flow", which is small — connecting a chosen category to a pre-filtered stub gallery is twenty minutes of wiring that folds naturally into the 14:00 "Gallery grid on stubs" block. That gives you a full two hours for sourcing on Day 3 and keeps the 10-by-D5 floor intact.

Raise it at tomorrow's standup rather than deciding silently — E3's template count is the thing D5 is judged on, and the whole team plans around that milestone.

---

## End of day

**1. Run the gates.**

```bash
npm run typecheck
npm run lint
npm run test
```

Nothing merges on a red pipeline (Coding Standard §16.12.3).

**2. Commit in Conventional Commits form** (Git Workflow B-3), scope `discovery`:

```bash
git add -A
git commit -m "feat(discovery): landing page and email/password auth with verification and reset"
git push -u origin discovery/landing-and-password-auth
```

**3. Open the PR** against `main`. The template asks for What / Why / How to test / Screenshots — screenshots are required for any change to the discovery surface. In the Why section cite the requirement IDs rather than prose: **A-5 (as amended by A2), FR-001, NFR-001, NFR-062**. Squash merge, branch deleted on merge.

**4. Attach the A2 amendment** to the PR, or link it. An INVARIANT changed; the record needs to travel with the code that changed it.

### The tests your schedule says must pass

| Block | Test |
|---|---|
| Landing structure | Landing renders responsively; CTA routes into the start flow |
| Landing polish | Looks intentional at all widths; images optimised; good Lighthouse first paint |
| Auth entry | Sign-up, sign-in, verification and reset all work end to end against a real inbox; failure messages never reveal whether an address is registered; a DOM scan finds no third-party sign-in control |

### What Day 3 needs from today

D3 builds intent capture (screen 03) and the gallery grid on stub data. It assumes the landing exists and can hand a signed-in user onward to `/new`. Both come out of today. It now also carries the template sourcing kickoff.

---

## Open items carried out of Day 2

| # | Item | Owner |
|---|---|---|
| 1 | Brute-force rate limiting on sign-in — per-user and per-IP, server-side and atomic (N-2, C-10, M7.1) | Adithya (E1) |
| 2 | `session.ts` reads `NEXT_PUBLIC_SUPABASE_ANON_KEY`; everything else uses `PUBLISHABLE_KEY`. Fixed today — confirm nothing else depended on the old name | You / E1 |
| 3 | `.env.example` was missing all four Supabase variables and `NEXT_PUBLIC_APP_URL`. Added today | You |
| 4 | `spend_capped` status disagrees between `errors/codes.ts` (402) and `errors/api-result.ts` (429). API Design says 429; delete the duplicate module | E1 |
| 5 | Error copy tables in `AuthCard` and `ResetPasswordForm` move into the shared error catalogue (M0.3) once it exists | E1 |
| 6 | A2 amendment needs written sign-off from E1 and the product owner before the day-19 freeze; PRD, SRS, UI Spec and test cases need updating to match | Product + E1 |
| 7 | Template sourcing kickoff moved to D3 16:00 — confirm at standup | You |
