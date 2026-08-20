import 'server-only';

export interface DeployConfig {
    apiBase: string;
    accountId: string;
    credentialKeyId: string;
    rootDomain: string;
}

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing environment variable: ${name}`);
    return value;
}

export function deployConfig(): DeployConfig {
    return {
        apiBase: required('HOSTING_API_BASE'),
        accountId: required('HOSTING_ACCOUNT_ID'),
        credentialKeyId: required('HOSTING_CREDENTIAL_KEY_ID'),
        // No default. The old fallback was 'pagecraft.in' -- a domain we do not own --
        // so a missing variable in production would have published every customer site
        // to an address nobody could reach, silently and with a live-looking URL.
        rootDomain: required('PAGECRAFT_ROOT_DOMAIN'),
    };
}
