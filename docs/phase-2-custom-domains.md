# Phase 2 — custom domains, and selling them

Owner: Adhyay (R3 · Publish & Deploy) · written at D20, for after launch

**Nothing here ships before launch.** D19 is a freeze and this is new architecture with a
money path in it. The free `*.pagecrafts.in` address already works and is what v1 launches
on.

---

## What is being asked for

Two ways to go live, chosen at publish:

1. **A PageCrafts address** — `raj-s-bakery.pagecrafts.in`. Free, instant, already built.
2. **Their own domain** — `rajsbakery.in`, bought through us, priced by what the domain costs.

Option 1 exists today. It simply isn't presented as a choice, because there is nothing to
choose between. This document is about option 2.

> **One correction to the original ask.** "Publish through Vercel or localhost" isn't a
> thing we can offer. Vercel hosts *PageCraft itself*; it never hosts customer sites.
> Localhost is one person's own machine and serves nobody. The free option is the
> `pagecrafts.in` subdomain, and it is a real, live, HTTPS website — not a lesser one.

---

## Before any of the engineering: what selling domains commits us to

This is the part worth reading twice, because it is a business decision that happens to
need code, not a feature that happens to involve money.

**A domain is a yearly commitment, not a purchase.** Hosting can be switched off and the
customer loses a website they can rebuild. A domain that lapses is gone — and it is the
address on their signage, their cards, their Google listing. If PageCraft forgets a
renewal, or stops operating, or a card fails silently, the customer loses their business
address. That is a much heavier promise than anything v1 makes.

**Domains are effectively non-refundable.** The registry charges the moment a name is
registered. If someone buys `rajsbakery.in` and changes their mind an hour later, the money
is gone. The refund policy has to say so plainly, *before* payment, in words a shop owner
understands.

**We collect real identity data.** Registration requires the registrant's real name,
address, phone and email, which go to the registry and appear in RDAP/WHOIS. That is
personal data under the DPDP Act 2023 ([R11], already cited in the pack) and it is more
sensitive than anything we hold today.

**Customers have a right to leave.** ICANN rules give them transfer-out. We must be able to
hand over an authorisation code on request, and we must not make leaving hard. Building
lock-in here would be both wrong and against the rules.

**Prices are not ours to fix.** `.in` and `.com` cost different amounts, registry prices
change yearly, and the first year is often discounted while renewal is not. A price cannot
be hardcoded the way `TIER_PRICE_INR` is — it has to be fetched and quoted.

**Who is the registrant?** The customer should be, not PageCraft. If we register in our own
name, we own their address and they are our hostage. It also makes us the legal contact for
whatever they publish. Put the customer's name on it.

### The question for the product owner

Not "can we build it" — we can. It is: **are we prepared to still be renewing someone's
domain in three years?** If the honest answer is no, sell hosting and let customers bring a
domain they bought elsewhere. That version is a day's work and carries none of the above.

---

## Registrar

We resell through an accredited registrar's API; we don't become a registrar ourselves.
Checked August 2026:

| Option | Fit |
| --- | --- |
| **ResellerClub** (LogicBoxes) | India-focused, INR billing, strong `.in` coverage, slab pricing that improves with volume, mature API. **The natural fit given we are India-based and billing through Razorpay.** |
| Namecheap | Not built for resellers — no proper reseller programme with registry-level pricing as of early 2026. |
| GoDaddy | Has a reseller programme, but pricing is high and automation is limited. We already use them for `pagecrafts.in`, which is not a reason to use them for this. |
| Dynadot / Openprovider / OpenSRS | Credible alternatives, less India-specific. Worth a quote if ResellerClub's slab pricing looks poor at our volume. |

**Verify terms before committing.** Reseller agreements, deposit minimums and per-TLD
pricing all change, and none of the above is a substitute for reading the current contract.

---

## The seam: `DomainRegistrar`

The same discipline that saved us on hosting. When GitHub's build queue stalled for sixteen
hours on D5, switching to Cloudflare cost **one adapter file** because nothing outside
`adapters/` knew the provider's name. Registrars deserve the same treatment — reseller terms
change, and being unable to move would be worse here than it was for hosting, because
customers' addresses would be stuck too.

```ts
export interface DomainRegistrar {
    search(name: string): Promise<{ available: boolean; priceInr: number; renewalInr: number }>;
    register(input: RegisterInput): Promise<{ registrarRef: string; expiresAt: string }>;
    renew(registrarRef: string, years: number): Promise<{ expiresAt: string }>;
    status(registrarRef: string): Promise<DomainStatus>;
    authCode(registrarRef: string): Promise<string>;   // transfer-out, non-negotiable
}
```

Enforce it with a static test, exactly like `tests/unit/deploy/provider-isolation.test.ts`.
No file outside `src/lib/domains/adapters/` may name a registrar.

---

## Data model

One table. A domain outlives any single deployment, so it does not belong on `deployments`.

```sql
create table public.domains (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete restrict,
  user_id       uuid not null,
  name          text not null unique,

  -- 'registered' — we bought it. 'connected' — they already owned it.
  -- Both attach to Cloudflare identically; only the money and the renewal differ.
  source        text not null check (source in ('registered', 'connected')),

  status        text not null,
  registrar_ref text,
  price_paid_inr integer,
  registered_at timestamptz,
  expires_at    timestamptz,
  auto_renew    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

**`on delete restrict`, not cascade.** Deleting a project must not silently orphan a domain
somebody paid for and is still using. Same instinct as C-12: deletion never takes down
something live.

**Status, as a sequence:** `quoted → paying → registering → attaching → live`, with
`failed`, `expiring`, `expired` and `transferred_out` as the ends. Mirrors the deployment
state machine so the dashboard can show both the same way.

---

## Money, and the one failure that matters

Reuse the Razorpay path from publish checkout — order, webhook, entitlement — with one
difference that cannot be glossed over.

**A quote must expire.** Registrar prices move. Show a price, hold it for fifteen minutes,
and re-check before charging. If it moved, say so rather than charging the old price and
absorbing the difference, or charging the new one silently.

**Failure after payment is worse here than it is for publish.** D14 already handles "paid,
then publish failed": the entitlement is retained and one retry runs. A domain is different
— if payment succeeds and registration then fails, somebody else may take the name in the
seconds between. There is no retry that fixes that.

So: **register first, charge second.** Authorise the payment, register the domain, then
capture. If registration fails, void the authorisation and nobody is charged. This inverts
the order used for publish, deliberately, and the reason should be written next to the code.

---

## Renewals — the part that bites

Everything above is a week's work. This is the part that runs for years.

- A daily job over `expires_at`
- Reminders at 30, 7 and 1 day
- Auto-renew on file, with a card that can fail — a failed renewal needs a human, not a retry loop
- A grace period after expiry, before the registry releases the name
- What happens when someone stops paying for hosting but their domain is still live

**The runbook entry matters more than the code.** Somebody has to know what to do when a
renewal fails at 2am on a Sunday for a customer whose shop opens at 9.

---

## Build order

Each stage is shippable and each de-risks the next.

**Stage 1 · Connect a domain they already own. — SHIPPED (custom-domain-connect).** No money, no
registrar, no renewals. Proves the custom-hostname path end to end — which is the same code
stages 3–5 need. One table, one endpoint, one screen.

**Stage 2 · Search and quote. — SHIPPED (search/quote UI + registrar seam; all plans).** Read-only
against the registrar. Shows availability and price, buys nothing. Flushes out rate limits,
caching and per-TLD pricing before money is involved.

**Stage 3 · Purchase. — SHIPPED (Go Live path + ResellerClub register + CF zone/NS + Razorpay).**
Authorise → register → capture → attach. Renewals and transfer-out UI still open.

**Stage 4 · Renewals.** Job, reminders, auto-renew, grace, runbook. *Two days.*

**Stage 5 · Transfer-out.** Auth code on request. Small, and non-negotiable. *Half a day.*

Stages 1–3 cover first-time buy. Do not sell at volume without Stage 4.

---

## Where the UI hooks in

Go Live only (editor top bar). Flow:

1. One-time deploy warning  
2. Default `*.pagecrafts.in` address **or** **Choose a Custom Domain**  
3. Suggest `.in` / `.co.in` / `.com` → confirm → pay → register + Cloudflare DNS  

Ops checklist: `docs/production-domains-setup.md`.

---

## Open questions for the product owner

1. Are we prepared to renew customers' domains for as long as they keep them?
2. Which TLDs do we sell? Starting with `.in` and `.com` only is a reasonable answer.
3. What is the markup over registrar cost?
4. Who is the registrant of record? **Recommendation: the customer.**
5. What does the refund policy say, and where is it shown before payment?
6. If someone stops paying for hosting, what happens to their domain?

Questions 1 and 4 decide whether this is worth building at all.

---

## Sources

- [ResellerClub — Domain Reseller Program (India)](https://india.resellerclub.com/domain-reseller)
- [ResellerClub — Reseller pricing](https://india.resellerclub.com/domain-reseller/pricing)
- [Namecheap — Do you have a domain reseller program?](https://www.namecheap.com/support/knowledgebase/article.aspx/754/63/do-you-have-a-domain-reseller-program/)
- [Openprovider — Namecheap alternatives for resellers](https://www.openprovider.com/blog/namecheap-alternatives)
- [Dynadot — Domain reseller program](https://www.dynadot.com/domain/reseller-program)
