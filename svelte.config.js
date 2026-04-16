import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    extensions: ['.svelte'],
    // Consult https://kit.svelte.dev/docs/integrations#preprocessors
    // for more information about preprocessors
    preprocess: [vitePreprocess()],

    vitePlugin: {
        inspector: true,
    },
    kit: {
        // Deploys as Cloudflare Pages + Pages Functions. API routes (including
        // /api/relay) run as same-origin functions so the OZ Relayer API key
        // stays server-side.
        adapter: adapter(),
    },
};
export default config;
