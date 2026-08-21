import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PREMIUM_PRICE_INR, PRO_PRICE_INR } from "@/lib/payments/pricing";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("account settings", () => {
  it("keeps notices, billing and privacy on the account slide, not site SEO", () => {
    const slide = read("src", "components", "deck", "SettingsSlide.tsx");
    const billing = read("src", "components", "settings", "BillingPlans.tsx");
    const notices = read("src", "components", "settings", "NotificationPrefs.tsx");
    const privacy = read("src", "components", "settings", "PrivacyAndData.tsx");
    const toggle = read("src", "components", "settings", "PreferenceSwitch.tsx");

    expect(slide).toContain("NotificationPrefs");
    expect(slide).toContain("BillingPlans");
    expect(slide).toContain("PrivacyAndData");
    expect(slide).toContain("in the editor");
    expect(notices).toContain("Website published successfully");
    expect(toggle).toContain('role="switch"');
    expect(toggle).toContain("cursor-pointer");
    expect(toggle).toContain("bg-gold");
    expect(billing).toContain("User Plans");
    expect(billing).toContain('href="/plans"');
    expect(billing).toContain("Cards stay with Razorpay");
    expect(billing).not.toContain("Switch to Starter");
    expect(billing).not.toContain("Rs 249");
    expect(billing).not.toContain("Billing is not live yet");
    expect(privacy).toContain("Download my data");
    expect(privacy).toContain("/api/v1/account/export");
  });

  it("sends the sidebar to designs, and plans live on /plans", () => {
    const sidebar = read("src", "components", "app", "AppSidebar.tsx");
    const publish = read("src", "components", "editor", "PublishCheckoutButton.tsx");
    const packages = read("src", "components", "settings", "PackagesPanel.tsx");
    const plansPage = read("src", "app", "plans", "page.tsx");

    expect(sidebar).toContain('href="/templates"');
    expect(sidebar).toContain("Browse designs");
    expect(sidebar).not.toContain("UpgradeToProButton");
    expect(sidebar).not.toContain("Billing is not live yet");
    expect(plansPage).toContain("PlansPanel");
    expect(publish).toContain("openCheckout");
    expect(publish).toContain("checkout");
    expect(publish).toContain("confirmDialog");
    expect(packages).toContain("confirmDialog");
    expect(packages).toContain("openAdvancedCheckout");
    expect(packages).toContain("openGenerationPassCheckout");
    expect(packages).not.toContain("disabled={!billing.paymentsReady");
  });

  it("puts User Plans on the username menu", () => {
    const menu = read("src", "components", "settings", "ProfileMenu.tsx");
    const header = read("src", "components", "landing", "SiteHeader.tsx");
    const remove = read("src", "components", "settings", "DeleteAccount.tsx");

    expect(header).toContain("<ProfileMenu");
    expect(menu).toContain('href="/plans"');
    expect(menu).toContain("User Plans");
    expect(menu).toContain("/api/v1/account");
    expect(menu).toContain("Email notices");
    expect(menu).toContain('href="/?slide=settings"');
    expect(menu).toContain("scrollIntoView");
    expect(menu).toContain("LogoutButton");
    expect(menu).toContain("cursor-pointer");
    expect(menu).not.toContain("openProCheckout");
    expect(menu).not.toContain("Rs 249");
    expect(remove).toContain("templates or looks you bought will be lost");
    expect(remove).toContain("Enter your password");
    expect(remove).toContain("variant=\"destructive\"");
    expect(remove).toContain("password");
  });
});

describe("paid designs", () => {
  it("prices Pro tiles at Rs 499 and Premium tiles at Rs 999", () => {
    expect(PRO_PRICE_INR).toBe(499);
    expect(PREMIUM_PRICE_INR).toBe(999);
  });

  it("sends locked templates to User Plans instead of buying one design", () => {
    const top = read("src", "components", "app", "AppTopBar.tsx");
    const card = read("src", "components", "discovery", "TemplateCard.tsx");
    const notice = read("src", "components", "discovery", "LockedPlanNotice.tsx");
    const detail = read("src", "components", "discovery", "TemplateDetailModal.tsx");
    const plans = read("src", "components", "settings", "PlansPanel.tsx");

    expect(top).toContain("<ProfileMenu");
    expect(card).not.toContain("unlockTemplate");
    expect(card).not.toContain("useUnlockPaidDesign");
    expect(card).toContain("TemplateDetailModal");
    expect(detail).toContain("LockedPlanNotice");
    expect(detail).not.toContain("BuyPaidItemCta");
    expect(notice).toContain("See User Plans");
    expect(notice).toContain('href="/plans"');
    expect(plans).toContain("openPlanCheckout");
    expect(plans).toContain("Upgrade to");
  });
});
