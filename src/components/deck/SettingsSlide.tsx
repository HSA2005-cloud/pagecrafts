import type { AccountResponse, BillingSummary } from "@/lib/contracts";
import { DEFAULT_BILLING } from "@/lib/contracts";
import { BillingPlans } from "@/components/settings/BillingPlans";
import { BillingProfile } from "@/components/settings/BillingProfile";
import { NotificationPrefs } from "@/components/settings/NotificationPrefs";
import { PrivacyAndData } from "@/components/settings/PrivacyAndData";
import { DeleteAccount } from "@/components/settings/DeleteAccount";

export function SettingsSlide({
    account,
    billing,
}: {
    account: AccountResponse | null;
    billing: BillingSummary | null;
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
                        Your account, notices, purchases, and what PageCrafts does with your work.
                        Title, SEO and domains for a site live on that site in the editor.
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

                        <NotificationPrefs initial={account.notifyPrefs} />
                        <BillingPlans account={account} initial={billing ?? DEFAULT_BILLING} />
                        <BillingProfile initial={account} />
                        <PrivacyAndData initial={account} />
                        <DeleteAccount email={account.email} />
                    </div>
                )}
            </div>
        </section>
    );
}
