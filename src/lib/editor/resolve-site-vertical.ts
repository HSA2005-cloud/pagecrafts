import 'server-only';

import { TEMPLATES } from '@/lib/templates';
import { templateUuid } from '@/lib/templates/template-id';
import type { Composition } from '@/lib/contracts';

/** Best-effort vertical slug for firewall checks on the server. */
export function resolveSiteVertical(opts: {
    composition?: Composition | null;
    sourceTemplateId?: string | null;
    contextText?: string | null;
}): string | null {
    const fromComposition = opts.composition?.vertical?.trim();
    if (fromComposition && fromComposition !== 'general-business') {
        return fromComposition;
    }

    if (opts.sourceTemplateId) {
        const template = TEMPLATES.find((item) => templateUuid(item.id) === opts.sourceTemplateId);
        const vertical = template?.vertical ?? template?.id;
        if (vertical) return vertical;
    }

    return null;
}
