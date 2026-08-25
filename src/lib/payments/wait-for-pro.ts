import type { BillingSummary } from "@/lib/contracts";
import { apiGet } from "@/lib/api/client";

// After Razorpay reports success the entitlement is ours once /payments/razorpay/verify
// has checked the signature and written the grant. Polling covers a short race before
// billing reflects the new plan (and still helps if only the webhook path ran).

async function billing(): Promise<BillingSummary | null> {
    const { data } = await apiGet<BillingSummary>("/api/v1/account/billing");
    return data ?? null;
}

export async function accountOwnsTemplate(templateId: string): Promise<boolean> {
    const summary = await billing();
    return Boolean(summary?.unlockedTemplateIds.includes(templateId));
}

export async function accountOwnsStyle(styleId: string): Promise<boolean> {
    const summary = await billing();
    return Boolean(summary?.unlockedStyleIds.includes(styleId));
}

async function waitUntil(
    check: () => Promise<boolean>,
    options?: { attempts?: number; delayMs?: number },
): Promise<boolean> {
    const attempts = options?.attempts ?? 8;
    const delayMs = options?.delayMs ?? 800;

    if (await check()) return true;

    for (let i = 0; i < attempts; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (await check()) return true;
    }

    return false;
}

export async function waitForTemplateGrant(
    templateId: string,
    options?: { attempts?: number; delayMs?: number },
): Promise<boolean> {
    return waitUntil(() => accountOwnsTemplate(templateId), options);
}

export async function waitForStyleGrant(
    styleId: string,
    options?: { attempts?: number; delayMs?: number },
): Promise<boolean> {
    return waitUntil(() => accountOwnsStyle(styleId), options);
}

export async function waitForAdvancedGrant(
    options?: { attempts?: number; delayMs?: number },
): Promise<boolean> {
    return waitUntil(async () => {
        const summary = await billing();
        return summary?.aiPackage === "advanced";
    }, options);
}

export async function waitForPlanGrant(
    plan: "pro" | "premium",
    options?: { attempts?: number; delayMs?: number },
): Promise<boolean> {
    return waitUntil(async () => {
        const summary = await billing();
        if (!summary) return false;
        if (plan === "pro") return summary.plan === "pro" || summary.plan === "premium";
        return summary.plan === "premium";
    }, options);
}

export async function waitForGenerationPass(
    atLeast: number,
    options?: { attempts?: number; delayMs?: number },
): Promise<boolean> {
    return waitUntil(async () => {
        const summary = await billing();
        return (summary?.generationPasses ?? 0) >= atLeast;
    }, options);
}
