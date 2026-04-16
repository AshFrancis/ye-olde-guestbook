import { Server } from '@stellar/stellar-sdk/rpc';
import { TransactionBuilder } from '@stellar/stellar-sdk';

import {
    PRIVATE_RELAYER_BASE_URL,
    PRIVATE_RELAYER_API_KEY,
} from '$env/static/private';
import {
    PUBLIC_STELLAR_NETWORK_PASSPHRASE,
    PUBLIC_STELLAR_RPC_URL,
} from '$env/static/public';

export interface RelaySuccess {
    hash: string;
}

/**
 * Submit a transaction on the user's behalf.
 *
 * Split by payload shape:
 * - `{ func, auth }` — Soroban host-function + auth entries. Forwarded to the
 *   OpenZeppelin Channels relayer, which wraps it in a channel-account tx
 *   envelope and pays the fees. This is the sponsored path most user actions
 *   take (`signAndSubmit`, our `/api/fund` helper).
 * - `{ xdr }` — a fully-built, signed transaction envelope. Submitted straight
 *   to Stellar RPC. Smart Account Kit's wallet deployment takes this path: it
 *   pre-signs with its shared deployer keypair (well-known, pre-funded on
 *   Testnet) and builds the fee with stellar-sdk's default safety margin,
 *   which OZ Channels rejects (they expect `tx.fee == resourceFee` strictly).
 */
export async function submitToRelayer(
    payload: { xdr: string } | { func: string; auth: string[] },
): Promise<RelaySuccess> {
    if ('xdr' in payload) {
        return submitSignedXdrToRpc(payload.xdr);
    }
    return submitSorobanToChannels(payload);
}

async function submitSorobanToChannels(payload: {
    func: string;
    auth: string[];
}): Promise<RelaySuccess> {
    if (!PRIVATE_RELAYER_BASE_URL || !PRIVATE_RELAYER_API_KEY) {
        throw new Error(
            'OpenZeppelin Relayer is not configured. Set PRIVATE_RELAYER_BASE_URL and PRIVATE_RELAYER_API_KEY in your .env (get a testnet key from https://channels.openzeppelin.com/testnet/gen).',
        );
    }

    const baseUrl = PRIVATE_RELAYER_BASE_URL.replace(/\/+$/, '');
    const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PRIVATE_RELAYER_API_KEY}`,
        },
        body: JSON.stringify({ func: payload.func, auth: payload.auth }),
    });

    const responseData = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(extractRelayerError(responseData, response.status));
    }

    const hash = extractHash(responseData);
    if (!hash) throw new Error('relayer returned no transaction hash');
    return { hash };
}

async function submitSignedXdrToRpc(xdr: string): Promise<RelaySuccess> {
    const rpc = new Server(PUBLIC_STELLAR_RPC_URL);
    const tx = TransactionBuilder.fromXDR(xdr, PUBLIC_STELLAR_NETWORK_PASSPHRASE);

    const sendResult = await rpc.sendTransaction(tx);
    if (sendResult.status === 'ERROR') {
        const detail = sendResult.errorResult
            ? sendResult.errorResult.result().switch().name
            : 'unknown';
        throw new Error(`RPC rejected transaction: ${detail}`);
    }
    if (sendResult.status !== 'PENDING') {
        throw new Error(`unexpected RPC status: ${sendResult.status}`);
    }

    const hash = sendResult.hash;
    // Poll briefly for the transaction so we surface failures early. If the
    // network is slow we accept the PENDING hash and return it — the caller
    // can poll separately.
    for (let attempt = 0; attempt < 15; attempt++) {
        const status = await rpc.getTransaction(hash);
        if (status.status === 'SUCCESS') return { hash };
        if (status.status === 'FAILED') {
            throw new Error('transaction failed on-chain');
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    return { hash };
}

function extractRelayerError(data: unknown, status: number): string {
    if (data && typeof data === 'object') {
        const d = data as { error?: unknown; data?: { details?: { message?: unknown } } };
        const nested =
            d.data && typeof d.data === 'object' ? d.data.details?.message : null;
        if (typeof nested === 'string') return nested;
        if (typeof d.error === 'string') return d.error;
    }
    return `relayer returned HTTP ${status}`;
}

function extractHash(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const outer = data as { data?: unknown; hash?: unknown };
    const inner =
        outer.data && typeof outer.data === 'object'
            ? (outer.data as { hash?: unknown }).hash
            : undefined;
    const hash = inner ?? outer.hash;
    return typeof hash === 'string' && hash.length > 0 ? hash : null;
}
