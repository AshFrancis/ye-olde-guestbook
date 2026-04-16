# Ye Olde Guestbook <!-- omit from toc -->

A passkey-powered dapp that acts like a smart-contract version of the [internet
guestbooks](https://en.wikipedia.org/wiki/Guestbook) from the olden days!

> **Fork notice.** This is an updated fork of
> [ElliotFriend/ye-olde-guestbook](https://github.com/ElliotFriend/ye-olde-guestbook).
> The original used `passkey-kit` and Launchtube, both of which are now legacy
> (Launchtube is archived and its hosted service is offline). This fork is
> rebuilt on:
>
> - [Smart Account Kit](https://github.com/kalepail/smart-account-kit) — the
>   successor SDK to `passkey-kit`.
> - [OpenZeppelin Smart Account](https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account) —
>   the audited smart account contracts it deploys.
> - [OpenZeppelin Relayer (Stellar Channels)](https://docs.openzeppelin.com/relayer/1.4.x/guides/stellar-channels-guide) —
>   replaces Launchtube for fee-sponsored submissions.

## Table of Contents <!-- omit from toc -->

- [Give it a Spin](#give-it-a-spin)
- [Passkeys](#passkeys)
- [Anatomy of the Repository](#anatomy-of-the-repository)
    - [Smart Contract](#smart-contract)
    - [Frontend](#frontend)
    - [Relayer Proxy](#relayer-proxy)
- [Running Locally](#running-locally)
- [Deploying to Cloudflare Pages](#deploying-to-cloudflare-pages)
- [More Info](#more-info)

## Give it a Spin

![guestbook screenshot](screenshot.png)

## Passkeys

Users sign transactions with a device passkey (Touch ID, Face ID, or a hardware
key) via WebAuthn. No seed phrases, no browser extensions — the private key
never leaves the authenticator, and the smart account contract verifies the
`secp256r1` signature on-chain.

Smart Account Kit handles the WebAuthn ceremony, deploys an OpenZeppelin Smart
Account per user on first signup, and stores the credential metadata in
IndexedDB so the session survives page reloads.

## Anatomy of the Repository

### Smart Contract

The [Stellar smart contract](https://developers.stellar.org/docs/build#smart-contracts)
powering the guestbook lives in `contracts/ye_olde_guestbook`. The `initialize.js`
script (invoked with `pnpm run setup`) builds it, deploys it, and regenerates
the TypeScript bindings in `packages/ye_olde_guestbook`.

### Frontend

The frontend is a [SvelteKit](https://kit.svelte.dev/) app under `src/`.

- `src/lib/passkeyClient.ts` wires up Smart Account Kit and exposes the
  `account`, `native`, and `send()` helpers the UI reaches for.
- `src/lib/server/relayer.ts` holds the server-side `ChannelsClient` and the
  API key for the OpenZeppelin Relayer.
- `src/routes/api/relay/+server.ts` proxies transaction submissions to the
  relayer so the API key never reaches the browser.
- `src/routes/api/fund/[address]/+server.ts` drops 25 XLM on a freshly-deployed
  wallet using a server-held funder keypair.

### Relayer Proxy

OpenZeppelin's hosted relayer doesn't accept calls from browser origins with
the API key embedded client-side. To keep the key off the wire we run the
`/api/relay` route as a same-origin Cloudflare Pages Function: the client
POSTs its XDR to `/api/relay`, the function forwards to
`https://channels.openzeppelin.com/testnet/<KEY>`, and the hash comes back.

## Running Locally

```bash
pnpm install
cp .env.example .env          # fill in values — see comments in the file
pnpm run setup                # build + deploy the guestbook contract
pnpm run dev
```

You'll need:

- A Testnet OpenZeppelin Channels API key
  ([generate one here](https://channels.openzeppelin.com/testnet/gen)).
- A funded Testnet G-account for the funder role
  ([Friendbot](https://friendbot.stellar.org)).
- A modern browser with a registered passkey authenticator.

## Deploying to Cloudflare Pages

With `@sveltejs/adapter-cloudflare` the whole app — static assets _and_ the
`/api/*` functions — deploys as a single Pages project. The short version:

```bash
pnpm run build
npx wrangler pages deploy .svelte-kit/cloudflare
```

Then set the four private env vars in the Pages project settings
(`PRIVATE_RELAYER_BASE_URL`, `PRIVATE_RELAYER_API_KEY`,
`PRIVATE_FUNDER_SECRET_KEY`, and the `PUBLIC_*` values) via
`wrangler pages secret put` or the Cloudflare dashboard.

## More Info

- Original source:
  <https://github.com/ElliotFriend/ye-olde-guestbook>
- Smart Account Kit:
  <https://github.com/kalepail/smart-account-kit>
- OpenZeppelin Smart Account docs:
  <https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account>
- OpenZeppelin Relayer — Stellar Channels guide:
  <https://docs.openzeppelin.com/relayer/1.4.x/guides/stellar-channels-guide>
- Developer documentation:
  <https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets>
- [Join us on Discord](https://discord.gg/stellardev) and ask questions in the
  `#passkeys` channel.
