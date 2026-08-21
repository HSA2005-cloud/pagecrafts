import Link from "next/link";

import type { AccountResponse } from "@/lib/contracts";
import { BillingProfile } from "@/components/settings/BillingProfile";
import { TrainingConsent } from "@/components/settings/TrainingConsent";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import { PLAN_CATALOG, type PlanId } from "@/lib/plans/catalog";

export function SettingsSlide({
    account,
    plan = "starter",
}: {
    account: AccountResponse | null;
    plan?: PlanId;
}) {
    return (
        <section
            id="settings"
            className="page-slide page-slide-tall"
            aria-labelledby="settings-heading"
        >
            <div className="mx-auto w-full max-w-3xl px-6">
                <header>
                    <h2
                        id="settings-heading"
                        className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
                    >
                        Settings
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Your account, the details on a receipt, and what PageCraft does with your
                        work.
                    </p>
                </header>

                {account === null ? (
                    <p className="mt-8 rounded-2xl glass-panel p-5 text-sm text-muted-foreground">
                        We could not load your settings just now. Nothing has changed — please
                        refresh the page.
                    </p>
                ) : (
                    <div className="mt-8 space-y-4">
                        <div className="rounded-2xl glass-panel p-5">
                            <p className="text-base font-semibold text-foreground">Account</p>
                            <dl className="mt-3 space-y-2.5 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <dt className="text-muted-foreground">Email</dt>
                                    <dd className="text-foreground">{account.email}</dd>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <dt className="text-muted-foreground">Verified</dt>
                                    <dd
                                        className={
                                            account.emailVerified
                                                ? "text-foreground"
                                                : "text-muted-foreground"
                                        }
                                    >
                                        {account.emailVerified
                                            ? "Yes"
                                            : "Not yet — check your inbox"}
                                    </dd>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <dt className="text-muted-foreground">Joined</dt>
                                    <dd className="text-foreground">
                                        {new Date(account.createdAt).toLocaleDateString("en-GB", {
                                            year: "numeric",
                                            month: "long",
                                            day: "numeric",
                                        })}
                                    </dd>
                                </div>
                            </dl>
                        </div>

                        <div className="rounded-2xl glass-panel p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-base font-semibold text-foreground">Plan</p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        You are on the{" "}
                                        <span className="font-semibold text-foreground">
                                            {PLAN_CATALOG[plan].name}
                                        </span>{" "}
                                        plan.
                                    </p>
                                </div>
                                <Link
                                    href="/plans"
                                    className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {plan === "premium" ? "View plans" : "Manage plan"}
                                </Link>
                            </div>
                        </div>

                        <BillingProfile initial={account} />
                        <TrainingConsent initial={account.trainingOptIn} />
                        <DeleteAccount />
                    </div>
                )}
            </div>
        </section>
    );
}
