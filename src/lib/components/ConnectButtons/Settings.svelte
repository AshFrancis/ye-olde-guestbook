<script lang="ts">
    import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';

    import Settings from '@lucide/svelte/icons/settings';
    import ChevronDown from '@lucide/svelte/icons/chevron-down';
    import Copy from '@lucide/svelte/icons/copy';
    import Wallet from '@lucide/svelte/icons/wallet';
    import CircleDollarSign from '@lucide/svelte/icons/circle-dollar-sign';
    import LogOut from '@lucide/svelte/icons/log-out';
    import LoaderCircle from '@lucide/svelte/icons/loader-circle';

    import { toaster } from '$lib/toaster';
    import { user } from '$lib/state/UserState.svelte';
    import { seContractLink } from '$lib/stellarExpert';
    import { fundContract, rpc } from '$lib/passkeyClient';
    import { Address, Asset, xdr, scValToNative } from '@stellar/stellar-sdk';
    import Identicon from '$lib/components/ui/Identicon.svelte';
    import TruncatedAddress from '$lib/components/ui/TruncatedAddress.svelte';
    import DonateButton from '$lib/components/ConnectButtons/DonateButton.svelte';

    import { PUBLIC_STELLAR_NETWORK_PASSPHRASE } from '$env/static/public';

    let balance: string = $state('0');
    let isFunding: boolean = $state(false);

    async function getBalance() {
        try {
            // Read the SAC `Balance(<owner>)` entry directly from ledger
            // storage. Avoids `contract.Client.from(...)` for the native SAC,
            // whose lazy spec load trips XDR encoding in our bundle.
            const nativeContractId = Asset.native().contractId(PUBLIC_STELLAR_NETWORK_PASSPHRASE);
            const ownerScVal = new Address(user.contractAddress!).toScVal();
            const balanceKey = xdr.LedgerKey.contractData(
                new xdr.LedgerKeyContractData({
                    contract: new Address(nativeContractId).toScAddress(),
                    key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Balance'), ownerScVal]),
                    durability: xdr.ContractDataDurability.persistent(),
                }),
            );

            const { entries } = await rpc.getLedgerEntries(balanceKey);
            if (entries.length === 0) {
                balance = '0';
                return;
            }
            const data = entries[0].val.contractData().val();
            const record = scValToNative(data) as { amount?: bigint };
            balance = (record.amount ?? 0n).toString();
        } catch (err) {
            console.error('[balance]', err);
            toaster.error({
                title: 'Error',
                description: 'Something went wrong checking your balance. Please try again later.',
            });
        }
    }

    async function fund() {
        isFunding = true;

        toaster.promise(fundContract(user.contractAddress!), {
            loading: {
                title: 'Loading...',
                description: 'You got it! Awaiting airdrop.',
            },
            success: () => {
                getBalance();
                return {
                    title: 'Success',
                    description: 'Funds received. Congrats!',
                };
            },
            error: (err: unknown) => {
                console.error('[fund]', err);
                const detail = err instanceof Error ? err.message : String(err);
                return {
                    title: 'Error',
                    description: `Funding failed: ${detail}`,
                };
            },
            finally: () => {
                isFunding = false;
            },
        });
    }

    async function copyAddress() {
        if (!user.contractAddress) return;
        try {
            await navigator.clipboard.writeText(user.contractAddress);
            toaster.success({ title: 'Copied', description: 'Smart wallet address copied.' });
        } catch (err) {
            console.error('[copy]', err);
            toaster.error({ title: 'Copy failed', description: 'Your browser blocked the copy.' });
        }
    }

    function logout() {
        user.reset();
    }
</script>

<Popover>
    <Popover.Trigger class="btn hover:preset-tonal-primary">
        <span><Settings /></span>
        <span><ChevronDown size="18" /></span>
    </Popover.Trigger>
    <Portal>
        <Popover.Positioner>
            <Popover.Content class="card shadow-lg bg-surface-200-800 p-4 space-y-4 max-w-[320px]">
                <div class="flex gap-4 w-full justify-between">
                    <div>
                        <Identicon address={user.contractAddress!} />
                    </div>
                    <div class="flex flex-col gap-0.25">
                        <div class="text-right"><small>Balance</small></div>
                        {#await getBalance() then}
                            <div>
                                <h4 class="h4">
                                    {parseFloat((Number(balance) / 1e7).toFixed(2))}<small
                                        >XLM</small
                                    >
                                </h4>
                            </div>
                        {/await}
                    </div>
                </div>
                <div>
                    <p class="font-bold">Your Wallet</p>
                    <div class="mt-1">
                        <div class="overflow-hidden flex items-center gap-3">
                            <TruncatedAddress address={user.contractAddress!} />
                            <button
                                type="button"
                                class="btn-icon btn-icon-sm preset-tonal-surface"
                                onclick={copyAddress}><Copy size="14" /></button
                            >
                        </div>
                    </div>
                </div>
                <hr class="opacity-50" />
                <nav class="flex flex-col gap-2">
                    <button
                        class="btn preset-tonal-success w-full"
                        onclick={fund}
                        disabled={isFunding}
                    >
                        <span>
                            {#if isFunding}
                                <LoaderCircle class="animate-spin" />
                            {:else}
                                <CircleDollarSign />
                            {/if}
                        </span>
                        <span>Fund Wallet</span>
                    </button>
                    <!-- eslint-disable svelte/no-navigation-without-resolve -->
                    <a
                        href={seContractLink(user.contractAddress!)}
                        class="btn preset-tonal-surface"
                        target="_blank"
                    >
                        <!-- eslint-enable svelte/no-navigation-without-resolve -->
                        <span><Wallet /></span>
                        <span>View Wallet</span></a
                    >
                    <DonateButton {getBalance} />
                    <button class="btn preset-tonal-error w-full" onclick={logout}>
                        <span><LogOut /></span>
                        <span>Logout</span></button
                    >
                </nav>
            </Popover.Content>
        </Popover.Positioner>
    </Portal>
</Popover>
