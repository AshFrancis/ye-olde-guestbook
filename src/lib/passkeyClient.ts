import { Server } from '@stellar/stellar-sdk/rpc';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import type { SmartAccountKit } from 'smart-account-kit';

import {
    PUBLIC_STELLAR_RPC_URL,
    PUBLIC_STELLAR_NETWORK_PASSPHRASE,
    PUBLIC_ACCOUNT_WASM_HASH,
    PUBLIC_WEBAUTHN_VERIFIER_ADDRESS,
} from '$env/static/public';

/**
 * Stellar RPC server. Safe to import from server routes — no browser deps.
 */
export const rpc = new Server(PUBLIC_STELLAR_RPC_URL);

/**
 * SmartAccountKit's shared deployer keypair, derived from a well-known seed.
 * Pre-funded on Testnet and used as the tx source for wallet deploys and
 * simulation fallbacks (stellar-sdk's `AssembledTransaction.build` wants a
 * G-address for its internal `Account`, and our users are C-addresses).
 */
export const SAK_DEPLOYER_PUBLIC_KEY = 'GAAH4OT36RRCCAGKARGPN2HLHT2NOBVFHO4GUHA6CF7UKQ4MMV24WQ4N';

// SmartAccountKit depends on WebAuthn + IndexedDB and trips Node's ESM
// resolver during SvelteKit's SSR prerender. Dynamic-imported on first touch
// so server routes that only use `rpc` never pay the cost.
let kitPromise: Promise<SmartAccountKit> | null = null;

function loadKit(): Promise<SmartAccountKit> {
    if (kitPromise) return kitPromise;
    kitPromise = import('smart-account-kit').then(({ SmartAccountKit, IndexedDBStorage }) => {
        return new SmartAccountKit({
            rpcUrl: PUBLIC_STELLAR_RPC_URL,
            networkPassphrase: PUBLIC_STELLAR_NETWORK_PASSPHRASE,
            accountWasmHash: PUBLIC_ACCOUNT_WASM_HASH,
            webauthnVerifierAddress: PUBLIC_WEBAUTHN_VERIFIER_ADDRESS,
            storage: new IndexedDBStorage(),
            rpName: 'Ye Olde Guestbook',
            // Same-origin proxy keeps the OZ Channels key server-side.
            relayerUrl: '/api/relay',
        });
    });
    return kitPromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AccountMethod = (...args: any[]) => Promise<any>;

/**
 * The user's smart account. `account.createWallet(...)`, `account.connectWallet(...)`,
 * etc. lazy-load SmartAccountKit on first call, then forward to the kit.
 */
export const account: Record<string, AccountMethod> = new Proxy(
    {} as Record<string, AccountMethod>,
    {
        get(_target, prop: string | symbol) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return async (...args: any[]) => {
                const kit = await loadKit();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const fn = (kit as any)[prop];
                if (typeof fn !== 'function') {
                    throw new Error(`smart account has no method ${String(prop)}`);
                }
                return fn.apply(kit, args);
            };
        },
    },
);

/**
 * Signs the supplied AssembledTransaction with the connected smart account
 * (triggering a passkey prompt) and submits it via the /api/relay proxy.
 */
export async function send<T>(tx: AssembledTransaction<T>) {
    const kit = await loadKit();
    return kit.signAndSubmit(tx);
}

/**
 * Hits /api/fund/[address] to airdrop 25 Testnet XLM into a fresh smart wallet.
 */
export async function fundContract(address: string) {
    return fetch(`/api/fund/${address}`).then(async (res) => {
        if (res.ok) return res.json();
        else throw await res.text();
    });
}
