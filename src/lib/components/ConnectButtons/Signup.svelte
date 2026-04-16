<script lang="ts">
    import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
    import { toaster } from '$lib/toaster';
    import { account, fundContract } from '$lib/passkeyClient';
    import { user } from '$lib/state/UserState.svelte';

    let username: string = $state('');

    async function signup() {
        try {
            // createWallet with autoSubmit=true deploys the smart account
            // on-chain via the configured relayer (our /api/relay proxy),
            // so we no longer need a separate send() step for the deploy tx.
            const result = await account.createWallet('Ye Olde Guestbook', username, {
                autoSubmit: true,
            });

            if (result.submitResult && !result.submitResult.success) {
                throw new Error(result.submitResult.error ?? 'wallet deploy failed');
            }

            user.set({
                keyId: result.credentialId,
                contractAddress: result.contractId,
            });

            await fundContract(result.contractId);
        } catch (err) {
            console.error('[signup]', err);
            const detail = err instanceof Error ? err.message : String(err);
            toaster.error({
                title: 'Signup failed',
                description: detail,
            });
        }
    }
</script>

<Dialog>
    <Dialog.Trigger class="btn preset-filled">Signup</Dialog.Trigger>
    <Portal>
        <Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50 backdrop-blur-sm" />
        <Dialog.Positioner class="fixed inset-0 z-50 flex justify-center items-center p-4">
            <Dialog.Content
                class="card bg-surface-100-900 p-4 space-y-4 shadow-xl w-sm max-w-screen-sm z-100"
            >
                <header class="flex justify-between items-center">
                    <Dialog.Title class="text-lg font-bold">Enter Name</Dialog.Title>
                </header>
                <Dialog.Description>Please provide your username below.</Dialog.Description>
                <input class="input" type="text" bind:value={username} />
                <footer class="flex justify-end gap-4">
                    <Dialog.CloseTrigger class="btn preset-tonal">Cancel</Dialog.CloseTrigger>
                    <button type="button" class="btn preset-filled" onclick={signup}>Confirm</button
                    >
                </footer>
            </Dialog.Content>
        </Dialog.Positioner>
    </Portal>
</Dialog>
