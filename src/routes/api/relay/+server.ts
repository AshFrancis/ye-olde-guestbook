import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

import { submitToRelayer } from '$lib/server/relayer';

/**
 * Same-origin proxy for the OpenZeppelin Relayer (Channels plugin).
 *
 * The client posts either `{ xdr }` or `{ func, auth[] }`; we forward the
 * payload to `https://channels.openzeppelin.com/<network>/<api-key>` using
 * credentials held server-side, then return the submitted transaction hash.
 * Keeping the relayer API key off the client is the whole point.
 */
export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return error(400, { message: 'request body must be a JSON object' });
    }

    const xdr = typeof body.xdr === 'string' ? body.xdr.trim() : '';
    const func = typeof body.func === 'string' ? body.func.trim() : '';

    try {
        if (xdr.length > 0) {
            return json(await submitToRelayer({ xdr }));
        }
        if (func.length > 0) {
            const auth = Array.isArray(body.auth)
                ? body.auth.filter((a: unknown): a is string => typeof a === 'string')
                : [];
            return json(await submitToRelayer({ func, auth }));
        }
        return error(400, { message: 'provide either `xdr` or `func` (+ optional `auth`)' });
    } catch (err) {
        console.error('[relay] submission failed:', err);
        return error(502, {
            message: err instanceof Error ? err.message : 'relayer submission failed',
        });
    }
};
