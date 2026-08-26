import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomDomainDnsRecord, DeployProvider } from "@/lib/deploy/provider";
import { HostingError } from "@/lib/deploy/adapters/hosting-error";
import { ApiError } from "@/lib/errors/respond";
import { validateHostname } from "@/lib/domains/hostname";

async function defaultDeployProvider(): Promise<DeployProvider> {
  // Lazy so checkout/billing on the home page does not pull Cloudflare upload + blake3.
  const { deployProvider } = await import("@/lib/deploy/adapters");
  return deployProvider;
}

export type DomainSource = "connected" | "registered";

export type DomainRowStatus =
  | "quoted"
  | "paying"
  | "registering"
  | "attaching"
  | "pending_dns"
  | "live"
  | "failed"
  | "expiring"
  | "expired"
  | "transferred_out";

export interface DomainRecord {
  id: string;
  projectId: string;
  name: string;
  source: DomainSource;
  status: DomainRowStatus;
  records: CustomDomainDnsRecord[];
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DomainRow {
  id: string;
  project_id: string;
  name: string;
  source: DomainSource;
  status: DomainRowStatus;
  dns_records: CustomDomainDnsRecord[] | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

function toRecord(row: DomainRow): DomainRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    source: row.source,
    status: row.status,
    records: Array.isArray(row.dns_records) ? row.dns_records : [],
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function siteIdFor(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<{ siteId: string } | never> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, user_id, repo_full_name")
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw new ApiError("internal", "Could not read the project.", error.message);
  if (!data) throw new ApiError("not_found", "That project does not exist.");
  if ((data.user_id as string) !== userId) {
    // RLS should already hide this; keep the same answer either way (SEC-14).
    throw new ApiError("not_found", "That project does not exist.");
  }

  const siteId = (data.repo_full_name as string | null)?.trim() ?? "";
  if (!siteId) {
    throw new ApiError(
      "validation_failed",
      "Publish this site with Go Live first. Custom domains need a live PageCrafts address to attach to.",
    );
  }

  return { siteId };
}

export async function listDomains(
  supabase: SupabaseClient,
  projectId: string,
): Promise<DomainRecord[]> {
  const { data, error } = await supabase
    .from("domains")
    .select(
      "id, project_id, name, source, status, dns_records, failure_reason, created_at, updated_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new ApiError("internal", "Could not read domains.", error.message);
  return ((data ?? []) as DomainRow[]).map(toRecord);
}

export async function connectDomain(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  rawName: string,
  provider?: DeployProvider,
): Promise<DomainRecord> {
  const host = provider ?? (await defaultDeployProvider());
  const checked = validateHostname(rawName);
  if (!checked.ok) {
    throw new ApiError("validation_failed", checked.reason);
  }

  const { siteId } = await siteIdFor(supabase, projectId, userId);

  const { data: existing } = await supabase
    .from("domains")
    .select("id, project_id")
    .eq("name", checked.name)
    .maybeSingle();

  if (existing && (existing.project_id as string) !== projectId) {
    throw new ApiError(
      "conflict",
      "That domain is already linked to another site on PageCrafts.",
    );
  }

  // Insert as attaching, then call the host, then flip to pending_dns / failed.
  let rowId = existing?.id as string | undefined;

  if (!rowId) {
    const { data: inserted, error: insertError } = await supabase
      .from("domains")
      .insert({
        project_id: projectId,
        user_id: userId,
        name: checked.name,
        source: "connected" satisfies DomainSource,
        status: "attaching" satisfies DomainRowStatus,
        dns_records: [],
      })
      .select(
        "id, project_id, name, source, status, dns_records, failure_reason, created_at, updated_at",
      )
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        throw new ApiError(
          "conflict",
          "That domain is already linked to a site on PageCrafts.",
        );
      }
      throw new ApiError("internal", "Could not save the domain.", insertError.message);
    }
    rowId = inserted.id as string;
  } else {
    await supabase
      .from("domains")
      .update({
        status: "attaching" satisfies DomainRowStatus,
        failure_reason: null,
      })
      .eq("id", rowId);
  }

  try {
    const attached = await host.attachCustomDomain(siteId, checked.name);

    const { data: updated, error: updateError } = await supabase
      .from("domains")
      .update({
        status: "pending_dns" satisfies DomainRowStatus,
        dns_records: attached.records,
        failure_reason: null,
      })
      .eq("id", rowId)
      .select(
        "id, project_id, name, source, status, dns_records, failure_reason, created_at, updated_at",
      )
      .single();

    if (updateError || !updated) {
      throw new ApiError(
        "internal",
        "The domain was attached but we could not save the DNS instructions.",
        updateError?.message,
      );
    }

    return toRecord(updated as DomainRow);
  } catch (error) {
    const message =
      error instanceof HostingError
        ? error.message
        : error instanceof Error
          ? error.message
          : "The host could not attach that domain.";

    await supabase
      .from("domains")
      .update({
        status: "failed" satisfies DomainRowStatus,
        failure_reason: message,
      })
      .eq("id", rowId);

    if (error instanceof ApiError) throw error;
    throw new ApiError("hosting_error", message);
  }
}

export async function verifyDomain(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  domainId: string,
  provider?: DeployProvider,
): Promise<DomainRecord> {
  const host = provider ?? (await defaultDeployProvider());
  const { siteId } = await siteIdFor(supabase, projectId, userId);

  const { data, error } = await supabase
    .from("domains")
    .select(
      "id, project_id, name, source, status, dns_records, failure_reason, created_at, updated_at",
    )
    .eq("id", domainId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw new ApiError("internal", "Could not read the domain.", error.message);
  if (!data) throw new ApiError("not_found", "That domain does not exist.");

  const row = data as DomainRow;

  try {
    const hostStatus = await host.domainStatus(siteId, row.name);

    if (hostStatus === "active") {
      const { data: updated, error: updateError } = await supabase
        .from("domains")
        .update({
          status: "live" satisfies DomainRowStatus,
          failure_reason: null,
        })
        .eq("id", domainId)
        .select(
          "id, project_id, name, source, status, dns_records, failure_reason, created_at, updated_at",
        )
        .single();

      if (updateError || !updated) {
        throw new ApiError("internal", "Could not mark the domain live.", updateError?.message);
      }

      // Point the newest live deployment at the custom hostname when DNS is ready.
      const liveUrl = `https://${row.name}`;
      await supabase
        .from("deployments")
        .update({ live_url: liveUrl })
        .eq("project_id", projectId)
        .eq("status", "live");

      return toRecord(updated as DomainRow);
    }

    if (hostStatus === "failed") {
      const { data: updated, error: updateError } = await supabase
        .from("domains")
        .update({
          status: "failed" satisfies DomainRowStatus,
          failure_reason:
            "The host could not verify this domain. Check the DNS records and try again.",
        })
        .eq("id", domainId)
        .select(
          "id, project_id, name, source, status, dns_records, failure_reason, created_at, updated_at",
        )
        .single();

      if (updateError || !updated) {
        throw new ApiError("internal", "Could not update the domain.", updateError?.message);
      }
      return toRecord(updated as DomainRow);
    }

    // Still waiting on DNS.
    if (row.status !== "pending_dns") {
      const { data: updated, error: updateError } = await supabase
        .from("domains")
        .update({ status: "pending_dns" satisfies DomainRowStatus })
        .eq("id", domainId)
        .select(
          "id, project_id, name, source, status, dns_records, failure_reason, created_at, updated_at",
        )
        .single();

      if (updateError || !updated) {
        throw new ApiError("internal", "Could not update the domain.", updateError?.message);
      }
      return toRecord(updated as DomainRow);
    }

    return toRecord(row);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message =
      error instanceof HostingError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not check DNS status.";
    throw new ApiError("hosting_error", message);
  }
}

/**
 * After domain payment: register (when the registrar allows), move NS to Cloudflare,
 * attach on Pages, and flip the live deployment URL when the host already reports active.
 *
 * Idempotent on domain name + project. Called from payment fulfill.
 */
export async function purchaseAndAttachDomain(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  rawName: string,
  contact: {
    name: string;
    email: string;
    phone?: string;
  },
  provider?: DeployProvider,
): Promise<DomainRecord> {
  const host = provider ?? (await defaultDeployProvider());
  const { domainRegistrar } = await import("@/lib/domains/registrar");
  const checked = validateHostname(rawName);
  if (!checked.ok) {
    throw new ApiError("validation_failed", checked.reason);
  }

  const { siteId } = await siteIdFor(supabase, projectId, userId);
  const whois = await resolveRegistrantContact(supabase, userId, contact);

  const { data: existing } = await supabase
    .from("domains")
    .select(
      "id, project_id, name, source, status, dns_records, failure_reason, created_at, updated_at, registrar_ref",
    )
    .eq("name", checked.name)
    .maybeSingle();

  if (existing && (existing.project_id as string) !== projectId) {
    throw new ApiError(
      "conflict",
      "That domain is already linked to another site on PageCrafts.",
    );
  }

  // Already live for this project — nothing more to do.
  if (existing && (existing.status as string) === "live") {
    return toRecord(existing as DomainRow);
  }

  let rowId = existing?.id as string | undefined;
  let registrarRef = (existing?.registrar_ref as string | null) ?? null;

  if (!rowId) {
    const { data: inserted, error: insertError } = await supabase
      .from("domains")
      .insert({
        project_id: projectId,
        user_id: userId,
        name: checked.name,
        source: "registered" satisfies DomainSource,
        status: "registering" satisfies DomainRowStatus,
        dns_records: [],
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        throw new ApiError(
          "conflict",
          "That domain is already linked to a site on PageCrafts.",
        );
      }
      throw new ApiError("internal", "Could not save the domain.", insertError.message);
    }
    rowId = inserted.id as string;
  } else {
    await supabase
      .from("domains")
      .update({
        source: "registered" satisfies DomainSource,
        status: "registering" satisfies DomainRowStatus,
        failure_reason: null,
      })
      .eq("id", rowId);
  }

  try {
    if (!registrarRef || registrarRef.startsWith("pending:")) {
      const registered = await domainRegistrar().register({
        name: checked.name,
        years: 1,
        contact: whois,
      });
      registrarRef = registered.registrarRef;

      await supabase
        .from("domains")
        .update({
          status: "attaching" satisfies DomainRowStatus,
          registrar_ref: registrarRef,
          registered_at: new Date().toISOString(),
          expires_at: registered.expiresAt,
          price_paid_inr: null,
        })
        .eq("id", rowId);
    } else {
      await supabase
        .from("domains")
        .update({ status: "attaching" satisfies DomainRowStatus, failure_reason: null })
        .eq("id", rowId);
    }

    // Live registrar: put DNS on Cloudflare, then flip registry nameservers.
    // Mock registrar skips NS (no registry order) and still tries Pages attach.
    if (!registrarRef.startsWith("mock:")) {
      const zone = await host.ensureDnsZone(checked.name);
      await domainRegistrar().setNameservers(registrarRef, zone.nameservers);
    }

    const attached = await host.attachCustomDomain(siteId, checked.name);
    const hostStatus = await host.domainStatus(siteId, checked.name).catch(() => "pending" as const);
    const nextStatus: DomainRowStatus = hostStatus === "active" ? "live" : "pending_dns";

    const { data: updated, error: updateError } = await supabase
      .from("domains")
      .update({
        status: nextStatus,
        dns_records: attached.records,
        failure_reason: null,
      })
      .eq("id", rowId)
      .select(
        "id, project_id, name, source, status, dns_records, failure_reason, created_at, updated_at",
      )
      .single();

    if (updateError || !updated) {
      throw new ApiError(
        "internal",
        "The domain was registered but we could not save its status.",
        updateError?.message,
      );
    }

    if (nextStatus === "live") {
      await supabase
        .from("deployments")
        .update({ live_url: `https://${checked.name}` })
        .eq("project_id", projectId)
        .eq("status", "live");
    }

    return toRecord(updated as DomainRow);
  } catch (error) {
    const message =
      error instanceof HostingError
        ? error.message
        : error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not finish domain setup.";

    await supabase
      .from("domains")
      .update({
        status: "failed" satisfies DomainRowStatus,
        failure_reason: message,
      })
      .eq("id", rowId);

    if (error instanceof ApiError) throw error;
    throw new ApiError("hosting_error", message);
  }
}

async function resolveRegistrantContact(
  supabase: SupabaseClient,
  userId: string,
  fallback: { name: string; email: string; phone?: string },
): Promise<{
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
}> {
  const { data } = await supabase
    .from("users")
    .select(
      "email, handle, phone, billing_line, billing_city, billing_state, billing_postal, billing_country",
    )
    .eq("id", userId)
    .maybeSingle();

  const row = (data ?? {}) as Record<string, unknown>;
  const email =
    (typeof row.email === "string" && row.email.trim()) ||
    fallback.email ||
    "support@pagecrafts.in";
  const handle = typeof row.handle === "string" ? row.handle.trim() : "";
  const name = fallback.name?.trim() || handle || email.split("@")[0] || "PageCrafts customer";

  return {
    name,
    email: email.toLowerCase(),
    phone:
      (typeof row.phone === "string" && row.phone.trim()) ||
      fallback.phone ||
      "+919999999999",
    address:
      (typeof row.billing_line === "string" && row.billing_line.trim()) || "Not provided",
    city: (typeof row.billing_city === "string" && row.billing_city.trim()) || "Bengaluru",
    state: (typeof row.billing_state === "string" && row.billing_state.trim()) || "KA",
    postcode: (typeof row.billing_postal === "string" && row.billing_postal.trim()) || "560001",
    country:
      (typeof row.billing_country === "string" && row.billing_country.trim().slice(0, 2)) ||
      "IN",
  };
}
