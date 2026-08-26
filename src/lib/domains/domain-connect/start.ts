import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/errors/respond";
import { deployProvider } from "@/lib/deploy/adapters";
import type { DeployProvider } from "@/lib/deploy/provider";
import { validateHostname } from "@/lib/domains/hostname";
import { discoverDomainConnect, templateListed } from "@/lib/domains/domain-connect/discover";
import {
  buildDomainConnectApplyUrl,
  domainConnectCallbackUrl,
  signDomainConnectState,
} from "@/lib/domains/domain-connect/apply";
import {
  DOMAIN_CONNECT_PROVIDER_ID,
  DOMAIN_CONNECT_SERVICE_ID,
} from "@/lib/domains/domain-connect/types";
import { connectDomain, type DomainRecord } from "@/lib/data/domains";

export interface StartDomainConnectResult {
  domain: DomainRecord;
  /** Registrar Authorize URL — open this in the browser. */
  applyUrl: string | null;
  providerName: string | null;
  pagesTarget: string;
  /** When applyUrl is null, why (show next to manual DNS records). */
  message?: string;
}

function appOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

/**
 * Attach on Cloudflare Pages, then build a Domain Connect Authorize URL when
 * the domain's DNS host supports it (GoDaddy first).
 */
export async function startDomainConnect(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  rawName: string,
  provider: DeployProvider = deployProvider,
): Promise<StartDomainConnectResult> {
  const checked = validateHostname(rawName);
  if (!checked.ok) {
    throw new ApiError("validation_failed", checked.reason);
  }

  const domain = await connectDomain(supabase, userId, projectId, checked.name, provider);
  const cname = domain.records.find((r) => r.type === "CNAME" || r.type === "ALIAS");
  const pagesTarget = (cname?.value ?? "").replace(/\.$/, "");
  if (!pagesTarget) {
    throw new ApiError(
      "internal",
      "The host did not return a target address for Domain Connect.",
    );
  }

  const discovery = await discoverDomainConnect(checked.name);
  if (!discovery.supported || !discovery.settings) {
    return {
      domain,
      applyUrl: null,
      providerName: discovery.displayName,
      pagesTarget,
      message:
        discovery.reason ??
        "This domain is not at GoDaddy (or another one-click provider). Use the DNS records below, or buy a domain through PageCrafts.",
    };
  }

  // Soft check — template may still work after bilateral onboard even if list API 404s.
  const listed = await templateListed(
    discovery.settings,
    DOMAIN_CONNECT_PROVIDER_ID,
    DOMAIN_CONNECT_SERVICE_ID,
  );

  const origin = appOrigin();
  const state = signDomainConnectState({
    projectId,
    userId,
    domain: checked.name,
    pagesTarget,
  });

  const applyUrl = buildDomainConnectApplyUrl({
    settings: discovery.settings,
    hostname: checked.name,
    pagesTarget,
    redirectUri: domainConnectCallbackUrl(origin),
    state,
  });

  return {
    domain,
    applyUrl,
    providerName: discovery.displayName,
    pagesTarget,
    message: listed
      ? undefined
      : `Continue at ${discovery.displayName}. If Authorize fails, our Domain Connect template may still be waiting for ${discovery.displayName} to enable PageCrafts — contact support.`,
  };
}
