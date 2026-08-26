import type { PublishFile } from '@/lib/contracts/deploy';

export interface ProvisionInput {
  projectId: string;
  projectName: string;
}

export interface ProvisionResult {
  siteId: string;
  subdomain: string;
  predictedUrl: string;
}

/** Where a site lives, derived from its id. */
export interface SiteAddress {
  subdomain: string;
  url: string;
}

/** DNS records the owner must create at their registrar for a connected custom domain. */
export interface CustomDomainDnsRecord {
  type: 'CNAME' | 'TXT' | 'ALIAS';
  host: string;
  value: string;
  /** Short hint for apex / flattening cases. */
  note?: string;
}

export type CustomDomainHostStatus = 'pending' | 'active' | 'failed';

export interface AttachCustomDomainResult {
  hostname: string;
  /** Where the CNAME (or ALIAS) should point — usually `{siteId}.pages.dev`. */
  target: string;
  records: CustomDomainDnsRecord[];
}

export interface DeployProvider {
  provisionSite(input: ProvisionInput): Promise<ProvisionResult>;
  /**
   * The address of an already-provisioned site.
   *
   * Each adapter owns the shape of its own site id — one uses `owner/name`, another the
   * bare subdomain — and only the adapter can turn one back into an address. publish() used
   * to do it inline as `siteId.split('/')[1]`, which is one adapter's shape assumed for all
   * of them: against the configured default that index was undefined, so every publish
   * verified and stored `https://undefined.<root domain>` (R3 D17). Asking the adapter is
   * also what NFR-041 requires — nothing outside adapters/ should know these shapes.
   */
  addressFor(siteId: string): SiteAddress;
  pushBuild(siteId: string, files: PublishFile[], message: string): Promise<{ commitSha: string }>;
  enableHosting(siteId: string): Promise<void>;
  verifyLive(url: string): Promise<boolean>;
  removeSite(siteId: string): Promise<void>;
  /** Attach a hostname the customer already owns. Idempotent on conflict. */
  attachCustomDomain(siteId: string, hostname: string): Promise<AttachCustomDomainResult>;
  /** Host-side status for a previously attached custom hostname. */
  domainStatus(siteId: string, hostname: string): Promise<CustomDomainHostStatus>;
  /**
   * Ensure a DNS zone exists for a domain we registered, and return the
   * nameservers the registrar must publish. Used after buy so we can flip NS
   * and finish Pages custom-hostname validation without manual DNS.
   */
  ensureDnsZone(hostname: string): Promise<{ nameservers: string[] }>;
}
