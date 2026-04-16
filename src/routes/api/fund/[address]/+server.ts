import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

import {
    Address,
    Asset,
    BASE_FEE,
    Contract,
    Keypair,
    Operation,
    TransactionBuilder,
    xdr,
} from '@stellar/stellar-sdk';
import { Api, Server } from '@stellar/stellar-sdk/rpc';

import { PRIVATE_FUNDER_SECRET_KEY } from '$env/static/private';
import {
    PUBLIC_STELLAR_NETWORK_PASSPHRASE,
    PUBLIC_STELLAR_RPC_URL,
} from '$env/static/public';

/**
 * Drops 25 Testnet XLM into a freshly-deployed smart wallet. Builds the SAC
 * `transfer(from, to, amount)` call directly, simulates to read the resource
 * fee + Soroban data, rebuilds the assembled tx from scratch, signs with the
 * funder keypair, and submits via RPC. We sidestep `contract.Client.from(...)`
 * and `rpc.prepareTransaction` because both trip on CF Workers bundling (the
 * former during XDR encoding of the SAC spec, the latter on an
 * `instanceof Transaction` check when stellar-base is loaded twice).
 */
export const GET: RequestHandler = async ({ params }) => {
    const fundKeypair = Keypair.fromSecret(PRIVATE_FUNDER_SECRET_KEY);
    const rpc = new Server(PUBLIC_STELLAR_RPC_URL);

    try {
        const nativeContractId = Asset.native().contractId(PUBLIC_STELLAR_NETWORK_PASSPHRASE);
        const sac = new Contract(nativeContractId);

        const amount = xdr.ScVal.scvI128(
            new xdr.Int128Parts({
                hi: xdr.Int64.fromString('0'),
                lo: xdr.Uint64.fromString((25n * 10_000_000n).toString()),
            }),
        );
        const transferArgs = [
            new Address(fundKeypair.publicKey()).toScVal(),
            new Address(params.address).toScVal(),
            amount,
        ];

        // Simulate to extract the Soroban transaction data + minResourceFee.
        const simAccount = await rpc.getAccount(fundKeypair.publicKey());
        const simTx = new TransactionBuilder(simAccount, {
            fee: BASE_FEE,
            networkPassphrase: PUBLIC_STELLAR_NETWORK_PASSPHRASE,
        })
            .addOperation(sac.call('transfer', ...transferArgs))
            .setTimeout(60)
            .build();

        const sim = await rpc.simulateTransaction(simTx);
        if (Api.isSimulationError(sim)) {
            throw new Error(`simulation failed: ${sim.error}`);
        }
        if (!Api.isSimulationSuccess(sim)) {
            throw new Error('simulation did not succeed');
        }

        // Rebuild from scratch with the assembled fee + Soroban data so we
        // never touch `TransactionBuilder.cloneFrom` (see header comment).
        const account = await rpc.getAccount(fundKeypair.publicKey());
        const assembledTx = new TransactionBuilder(account, {
            fee: (Number(BASE_FEE) + Number(sim.minResourceFee)).toString(),
            networkPassphrase: PUBLIC_STELLAR_NETWORK_PASSPHRASE,
        })
            .addOperation(
                Operation.invokeHostFunction({
                    func: xdr.HostFunction.hostFunctionTypeInvokeContract(
                        new xdr.InvokeContractArgs({
                            contractAddress: new Address(nativeContractId).toScAddress(),
                            functionName: 'transfer',
                            args: transferArgs,
                        }),
                    ),
                    auth: sim.result?.auth ?? [],
                }),
            )
            .setSorobanData(sim.transactionData.build())
            .setTimeout(60)
            .build();

        assembledTx.sign(fundKeypair);

        const sendResult = await rpc.sendTransaction(assembledTx);
        if (sendResult.status === 'ERROR') {
            const reason = sendResult.errorResult
                ? sendResult.errorResult.result().switch().name
                : 'unknown';
            throw new Error(`RPC rejected fund tx: ${reason}`);
        }
        if (sendResult.status !== 'PENDING') {
            throw new Error(`unexpected RPC status: ${sendResult.status}`);
        }

        const hash = sendResult.hash;
        for (let attempt = 0; attempt < 20; attempt++) {
            const status = await rpc.getTransaction(hash);
            if (status.status === 'SUCCESS') {
                return json({ status: 200, message: 'Smart wallet successfully funded', hash });
            }
            if (status.status === 'FAILED') {
                throw new Error('fund transaction failed on-chain');
            }
            await new Promise((r) => setTimeout(r, 1000));
        }
        return json({ status: 202, message: 'Fund tx pending', hash });
    } catch (err) {
        console.error('[fund]', err);
        const detail = err instanceof Error ? err.message : String(err);
        return error(500, { message: `Error when funding smart wallet: ${detail}` });
    }
};
