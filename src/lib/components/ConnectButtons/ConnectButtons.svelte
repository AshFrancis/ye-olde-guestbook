<script lang="ts">
    import { user } from '$lib/state/UserState.svelte';
    import { account } from '$lib/passkeyClient';

    import Settings from './Settings.svelte';
    import Signup from './Signup.svelte';
    import Login from './Login.svelte';
    import { onMount } from 'svelte';

    onMount(async () => {
        if (!user.keyId) return;

        try {
            // Silent reconnect using the credentialId we already saved in
            // localStorage. No passkey prompt on page reload.
            const result = await account.connectWallet({ credentialId: user.keyId });
            if (!result) return;

            user.set({
                keyId: result.credentialId,
                contractAddress: result.contractId,
            });
        } catch (err) {
            // Credential is in storage but the kit can't resolve it to a
            // live on-chain contract (stale session, different device, etc.).
            // Keep the cached address so Settings still renders.
            console.warn('[connect] silent reconnect failed:', err);
        }
    });
</script>

<div class="flex space-x-1 md:space-x-2">
    {#if !user.contractAddress}
        <Signup />
        <Login />
    {:else}
        <Settings />
    {/if}
</div>
