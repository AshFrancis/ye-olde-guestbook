<script lang="ts">
    import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
    import { SAK_DEPLOYER_PUBLIC_KEY, send } from '$lib/passkeyClient';
    import { networks } from 'ye_olde_guestbook';
    import { user } from '$lib/state/UserState.svelte';
    import { toaster } from '$lib/toaster';
    import { Address, Asset, contract, xdr } from '@stellar/stellar-sdk';

    import HandHelping from '@lucide/svelte/icons/hand-helping';
    import LoaderCircle from '@lucide/svelte/icons/loader-circle';

    import {
        PUBLIC_STELLAR_NETWORK_PASSPHRASE,
        PUBLIC_STELLAR_RPC_URL,
    } from '$env/static/public';

    interface Props {
        getBalance: () => void;
    }
    let { getBalance }: Props = $props();

    let isDonating: boolean = $state(false);
    let donation: number | undefined = $state();

    async function sendDonation() {
        if (!donation) {
            throw 'undefined donation amount';
        }

        // Build the SAC `transfer(from, to, amount)` call with ScVal args so
        // we avoid `contract.Client.from` (flaky with the SAC spec in our
        // bundle). `send()` passes the result to SmartAccountKit's
        // signAndSubmit, which signs the smart account's auth entry and
        // submits via /api/relay.
        const nativeContractId = Asset.native().contractId(PUBLIC_STELLAR_NETWORK_PASSPHRASE);
        const amountI128 = xdr.ScVal.scvI128(
            new xdr.Int128Parts({
                hi: xdr.Int64.fromString('0'),
                lo: xdr.Uint64.fromString(
                    BigInt(Math.round(donation * 10_000_000)).toString(),
                ),
            }),
        );

        const at = await contract.AssembledTransaction.build({
            contractId: nativeContractId,
            method: 'transfer',
            args: [
                new Address(user.contractAddress!).toScVal(),
                new Address(networks.testnet.contractId).toScVal(),
                amountI128,
            ],
            rpcUrl: PUBLIC_STELLAR_RPC_URL,
            networkPassphrase: PUBLIC_STELLAR_NETWORK_PASSPHRASE,
            // G-address stand-in for the source (stellar-sdk's Account
            // rejects C-addresses). signAndSubmit re-signs with its own copy
            // of this deployer before submitting.
            publicKey: SAK_DEPLOYER_PUBLIC_KEY,
            timeoutInSeconds: 60,
            parseResultXdr: (result: xdr.ScVal) => result,
        });

        await send(at);
    }

    async function donate() {
        isDonating = true;
        toaster.promise(sendDonation(), {
            loading: {
                title: 'Loading...',
                description: 'Submitting donation. Much appreciated!',
            },
            success: () => ({
                title: 'Success',
                description: 'Donation received! You really ARE the goat.',
            }),
            error: (err: unknown) => {
                console.error('[donate]', err);
                const detail = err instanceof Error ? err.message : String(err);
                return {
                    title: 'Error',
                    description: `Donation failed: ${detail}`,
                };
            },
            finally: () => {
                isDonating = false;
                getBalance();
            },
        });
    }
</script>

<Dialog>
    <Dialog.Trigger class="w-full">
        <button class="btn preset-tonal-surface w-full" disabled={isDonating}>
            <span>
                {#if isDonating}
                    <LoaderCircle class="animate-spin" />
                {:else}
                    <HandHelping />
                {/if}
            </span>
            <span>Send Donation</span>
        </button>
    </Dialog.Trigger>
    <Portal>
        <Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50 backdrop-blur-sm" />
        <Dialog.Positioner class="fixed inset-0 z-50 flex justify-center items-center p-4">
            <Dialog.Content
                class="card bg-surface-100-900 p-4 space-y-4 shadow-xl w-sm max-w-screen-sm z-100"
            >
                <header class="flex justify-between items-center">
                    <Dialog.Title class="text-lg font-bold"
                        >Your Generosity Knows No Bounds!</Dialog.Title
                    >
                </header>
                <Dialog.Description>
                    Donations help this guestbook stay alive. Please enter the quantity of XLM you
                    would like to donate.
                </Dialog.Description>
                <label class="label">
                    <span class="label-text">Donation Amount</span>
                    <input class="input" type="number" placeholder="10" bind:value={donation} />
                </label>
                <footer class="flex justify-end gap-4">
                    <Dialog.CloseTrigger class="btn preset-tonal">Cancel</Dialog.CloseTrigger>
                    <Dialog.CloseTrigger class="btn preset-filled" onclick={donate}
                        >Confirm</Dialog.CloseTrigger
                    >
                </footer>
            </Dialog.Content>
        </Dialog.Positioner>
    </Portal>
</Dialog>
