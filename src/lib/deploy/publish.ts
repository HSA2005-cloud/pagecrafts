import 'server-only';
import type { DeploymentState, PublishFile } from '@/lib/contracts/deploy';
import type { DeployProvider } from './provider';
import { deployProvider } from './adapters';
import { runOnce } from './idempotency';
import { step } from './log';
import { toPublishError } from './errors';
import type { FailureReason } from './failure';

export interface PublishInput {
    projectId: string;
    projectName: string;
    files: PublishFile[];
    siteId?: string | null;
    idempotencyKey: string;
}

export interface PublishResult {
    siteId: string;
    subdomain: string;
    liveUrl: string | null;
    /**
     * Why the attempt did not reach `live`, or null when it did.
     *
     * A value from a closed set, never a sentence: the words a person reads are derived
     * from it by lib/deploy/failure.ts, so improving them improves rows already written.
     */
    reason: FailureReason | null;
    /**
     * The address a `verifying` result is waiting on.
     *
     * Set only when the site was built and hosted but has not answered yet. It is what a
     * resume needs: re-checking one URL is the whole of finishing the publish, and without
     * it the only way to find out is to run the entire thing again.
     */
    pendingUrl: string | null;
    commitSha: string;
    state: DeploymentState;
}

export function publish(
    input: PublishInput,
    onState: (state: DeploymentState) => void = () => { },
    provider: DeployProvider = deployProvider,
): Promise<PublishResult> {
    return runOnce(input.idempotencyKey, () => run(input, onState, provider));
}

async function run(
    input: PublishInput,
    onState: (state: DeploymentState) => void,
    provider: DeployProvider,
): Promise<PublishResult> {
    const ctx = { projectId: input.projectId };
    let stage = 'provisioning';

    onState('pending');

    let siteId = input.siteId ?? null;

    try {
        if (!siteId) {
            onState('provisioning');
            const site = await step('provisioning', ctx, () =>
                provider.provisionSite({
                    projectId: input.projectId,
                    projectName: input.projectName,
                }),
            );
            siteId = site.siteId;
        }

        const id = siteId;
        // Asked of the provider rather than parsed out of the id here. This was
        // `id.split('/')[1]`, which is one adapter's `owner/name` shape assumed for every
        // adapter. Against the configured default — whose site id is the bare subdomain —
        // that index was undefined, so every publish verified, reported and stored
        // `https://undefined.<root domain>`. It went unnoticed because every publish test
        // used a fake built in the other shape (R3 D17).
        const { subdomain, url } = provider.addressFor(id);
        const siteCtx = { ...ctx, siteId: id };

        stage = 'pushing';
        onState('pushing');
        const { commitSha } = await step('pushing', siteCtx, () =>
            provider.pushBuild(
                id,
                input.files,
                `Publish ${input.projectName} - ${new Date().toISOString()}`,
            ),
        );

        // Always (re)attach hosting. enableHosting is idempotent (409 / 400).
        stage = 'enabling_hosting';
        onState('enabling_hosting');
        await step('enabling_hosting', siteCtx, () => provider.enableHosting(id));

        // No second origin poll. pushBuild already confirmed the Pages deployment;
        // enableHosting attached DNS. Re-verifying here was burning 5–8s after success.
        onState('live');

        return {
            siteId: id,
            subdomain,
            liveUrl: url,
            pendingUrl: null,
            commitSha,
            state: 'live',
            reason: null,
        };
    } catch (error) {
        onState('failed');
        // The site id travels with the failure. Provisioning claims a subdomain; if the
        // attempt then dies at pushing, the claim is real but nobody recorded it — so the
        // retry asks for the same name, is told it is taken (by us), and settles for
        // `name-2`. The person's address moves because of a transient 502, and the site
        // that was claimed first is orphaned. This is what lets the caller hold on to it.
        throw toPublishError(stage, error, siteId);
    }
}
