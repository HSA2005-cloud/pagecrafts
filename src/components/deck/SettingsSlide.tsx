import type { AccountResponse, BillingSummary } from "@/lib/contracts";
import { DEFAULT_BILLING } from "@/lib/contracts";
import { AccountPanel } from "@/components/settings/AccountPanel";
import { AiCreditsPanel } from "@/components/settings/AiCreditsPanel";
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
                        Your account, notices, billing, and privacy. Site title, SEO and domains
                        live in the editor.
                    </p>
                </header>

                {account === null ? (
                    <p className="mt-8 rounded-2xl glass-panel p-5 text-sm text-muted-foreground">
                        We could not load your settings just now. Nothing has changed — please
                        refresh the page.
                    </p>
                ) : (
                    <div className="mt-8 space-y-4">
                        <AccountPanel account={account} />
                        <NotificationPrefs initial={account.notifyPrefs} />
                        <AiCreditsPanel billing={billing ?? DEFAULT_BILLING} />
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
