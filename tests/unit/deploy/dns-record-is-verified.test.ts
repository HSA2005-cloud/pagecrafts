import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// premium-cooking-class.pagecrafts.in answered DNS_PROBE_FINISHED_NXDOMAIN after a publish
// that reported success. The address had no DNS record at all.
//
// enableHosting does write one. It also swallows every 400 from that write:
//
//     .catch((error) => {
//         if (!(error instanceof HostingError && error.status === 400)) throw error;
//     })
//
// Cloudflare answers 400 for "that record is already there" and for every reason a record
// cannot be written, and cf() keeps only the HTTP status — the error code that separates
// them is dropped in cloudflare-client. So the catch cannot tell a harmless duplicate from
// a total failure, and it treated both as fine.
//
// verifyLive could not catch it either: it is a 2,000 ms probe, which is far below DNS
// propagation, so it is not a check on this at all.

const adapter = readFileSync(
    join(process.cwd(), 'src', 'lib', 'deploy', 'adapters', 'cloudflare-pages.ts'),
    'utf8',
);

const client = readFileSync(
    join(process.cwd(), 'src', 'lib', 'deploy', 'adapters', 'cloudflare-client.ts'),
    'utf8',
);

describe('publishing does not claim an address it never created', () => {
    it('reads the record back after writing it', () => {
        expect(adapter).toMatch(/GET['"],\s*\n?\s*`\/zones\/\$\{zone\}\/dns_records\?/);
    });

    it('fails loudly when the zone has no record for the address', () => {
        expect(adapter).toMatch(/if \(!records\?\.length\)/);
        expect(adapter).toMatch(/has no DNS record/);
    });

    it('says what to do about it', () => {
        expect(adapter).toMatch(/Publishing again usually fixes it/);
    });

    // The read-back exists because this information is thrown away one layer down. If cf()
    // ever keeps the code, the catch could be made specific and this test revisited.
    it('documents why the status alone cannot decide it', () => {
        expect(client).toMatch(/errors\?:\s*\{\s*code: number/);
        expect(client).toMatch(/new HostingError\(redact\(String\(message\)\), res\.status\)/);
        expect(adapter).toMatch(/cf\(\) keeps only the HTTP status/);
    });
});

describe('the checks around it are honest about what they cover', () => {
    it('leaves verifyLive as the short probe it is', () => {
        // Not a DNS check and never was — 2s against propagation. Kept so nobody reads it
        // as one; the read-back above is what guards the address.
        expect(adapter).toMatch(/timeoutMs:\s*2_?000/);
    });
});
