"use client";

import { useCallback, useRef, type ReactNode } from "react";

import { useRazorpayCheckout, type CheckoutStatus } from "@/hooks/useRazorpayCheckout";
import {
    waitForPlanGrant,
    waitForStyleGrant,
    waitForTemplateGrant,
} from "@/lib/payments/wait-for-pro";
import type { PaidPlan } from "@/lib/payments/pricing";
import { requiredPlanForStyle, requiredPlanForTemplate } from "@/lib/payments/pricing";
import { TEMPLATES } from "@/lib/templates";
import { templateUuid } from "@/lib/templates/template-id";

type Pending = {
    resolve: (ok: boolean) => void;
    reject: (error: Error) => void;
};

type Target =
    | { type: "plan"; plan: PaidPlan; templateId?: string; styleId?: string };

function planForTemplateId(templateId: string): PaidPlan {
    const match =
        TEMPLATES.find((t) => t.id === templateId)
        ?? TEMPLATES.find((t) => templateUuid(t.id) === templateId);
    return requiredPlanForTemplate(match?.tier) ?? "pro";
}

function planForStyleId(styleId: string): PaidPlan {
    if (styleId === "motion") return requiredPlanForStyle("premium") ?? "premium";
    return requiredPlanForStyle("pro") ?? "pro";
}

/**
 * Upgrade to Pro or Premium (plan unlocks the whole tier). Waits until the
 * signed webhook has granted the plan — browser success is not enough.
 */
export function useUnlockPaidDesign(): {
    unlockTemplate: (templateId: string) => Promise<boolean>;
    unlockStyle: (styleId: string) => Promise<boolean>;
    unlockPlan: (plan: PaidPlan) => Promise<boolean>;
    status: CheckoutStatus;
    error: string | null;
    confirmDialog: ReactNode;
} {
    const pendingRef = useRef<Pending | null>(null);
    const pendingTargetRef = useRef<Target | null>(null);

    const settle = (ok: boolean, error?: Error) => {
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (!pending) return;
        if (error) pending.reject(error);
        else pending.resolve(ok);
    };

    const { openPlanCheckout, status, error, confirmDialog } = useRazorpayCheckout({
        onAlreadyGranted: () => settle(true),
        onSuccess: () => {
            const target = pendingTargetRef.current;
            if (!target) {
                settle(true);
                return;
            }
            void waitForPlanGrant(target.plan).then(async (planOk) => {
                if (!planOk) {
                    settle(false);
                    return;
                }
                if (target.templateId) {
                    settle(await waitForTemplateGrant(target.templateId, { attempts: 4, delayMs: 400 }));
                    return;
                }
                if (target.styleId) {
                    settle(await waitForStyleGrant(target.styleId, { attempts: 4, delayMs: 400 }));
                    return;
                }
                settle(true);
            });
        },
        onDismiss: () => settle(false),
        onError: (message) => settle(false, new Error(message)),
    });

    const run = useCallback(
        async (target: Target, open: () => Promise<void>): Promise<boolean> => {
            pendingTargetRef.current = target;
            const result = new Promise<boolean>((resolve, reject) => {
                pendingRef.current = { resolve, reject };
            });
            await open();
            return result;
        },
        [],
    );

    const unlockPlan = useCallback(
        (plan: PaidPlan) =>
            run({ type: "plan", plan }, () => openPlanCheckout(plan)),
        [openPlanCheckout, run],
    );

    const unlockTemplate = useCallback(
        (templateId: string) => {
            const plan = planForTemplateId(templateId);
            return run({ type: "plan", plan, templateId }, () => openPlanCheckout(plan));
        },
        [openPlanCheckout, run],
    );

    const unlockStyle = useCallback(
        (styleId: string) => {
            const plan = planForStyleId(styleId);
            return run({ type: "plan", plan, styleId }, () => openPlanCheckout(plan));
        },
        [openPlanCheckout, run],
    );

    return { unlockTemplate, unlockStyle, unlockPlan, status, error, confirmDialog };
}
