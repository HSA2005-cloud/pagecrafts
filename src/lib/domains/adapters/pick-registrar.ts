import 'server-only';

import type { DomainRegistrar } from '../registrar';
import { createMockRegistrar } from './mock';
import { createResellerClubRegistrar } from './resellerclub';

/**
 * Active registrar. Real credentials → live adapter; otherwise the mock so UI/dev
 * and contract tests can exercise search without a deposit account.
 *
 * This file sits under adapters/ so provider-isolation tests allow naming the vendor.
 */
export function domainRegistrar(): DomainRegistrar {
    const userId = process.env.RESELLERCLUB_USER_ID?.trim();
    const apiKey = process.env.RESELLERCLUB_API_KEY?.trim();

    if (userId && apiKey) {
        return createResellerClubRegistrar({ userId, apiKey });
    }

    return createMockRegistrar();
}
