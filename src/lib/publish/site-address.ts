/** Public PageCrafts subdomain suffix shown in the Go Live dialog. */
export function pagecraftRootDomain(): string {
    return process.env.NEXT_PUBLIC_PAGECRAFT_ROOT_DOMAIN ?? 'pagecrafts.in';
}

export function previewSiteUrl(siteName: string): string {
    const slug = siteName
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .replace(/-+$/g, '') || 'site';
    return `https://${slug}.${pagecraftRootDomain()}`;
}
