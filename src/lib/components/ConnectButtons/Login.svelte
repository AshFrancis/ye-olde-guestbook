<script lang="ts">
    import { account } from '$lib/passkeyClient';
    import { toaster } from '$lib/toaster';
    import { user } from '$lib/state/UserState.svelte';

    async function login() {
        try {
            // `prompt: true` asks the user's authenticator to pick a passkey;
            // SmartAccountKit uses the selected credential to look up the
            // matching smart-account contract via its IndexedDB index.
            const result = await account.connectWallet({ prompt: true });
            if (!result) throw new Error('wallet connection was cancelled');

            user.set({
                keyId: result.credentialId,
                contractAddress: result.contractId,
            });
        } catch (err) {
            console.error('[login]', err);
            const detail = err instanceof Error ? err.message : String(err);
            toaster.error({ title: 'Login failed', description: detail });
        }
    }
</script>

<button class="btn preset-tonal-primary" onclick={login}>Login</button>
