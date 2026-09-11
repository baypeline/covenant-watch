import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import {
  DustSecretKey,
  LedgerParameters,
  ZswapSecretKeys,
  type CoinPublicKey,
  type EncPublicKey,
  type FinalizedTransaction,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { MidnightProviders, MidnightProvider, UnboundTransaction, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import { type DustWalletOptions, type EnvironmentConfiguration, FluentWalletBuilder } from '@midnight-ntwrk/testkit-js';
import type { WalletFacade, UnshieldedKeystore } from '@midnight-ntwrk/wallet-sdk';
import * as Rx from 'rxjs';

import {
  Contract,
  ledger as decodeLedger,
  pureCircuits,
} from '../contract/src/managed/covenant-watch/contract/index.js';

// This funded seed and local password are valid only for the ephemeral `undeployed` dev network.
const NETWORK_ID = 'undeployed';
const GENESIS_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';
const PRIVATE_STATE_ID = 'covenantWatchSmokePrivateState';
const fullDemo = process.argv.includes('--full-demo');
const indexerPort = process.env.COVENANT_INDEXER_PORT ?? '18088';
const nodePort = process.env.COVENANT_NODE_PORT ?? '19944';
const proofPort = process.env.COVENANT_PROOF_PORT ?? '16300';
const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.covenant-runtime');
const zkConfigPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'contract',
  'src',
  'managed',
  'covenant-watch',
);

const environment: EnvironmentConfiguration = {
  walletNetworkId: NETWORK_ID,
  networkId: NETWORK_ID,
  indexer: `http://127.0.0.1:${indexerPort}/api/v4/graphql`,
  indexerWS: `ws://127.0.0.1:${indexerPort}/api/v4/graphql/ws`,
  node: `http://127.0.0.1:${nodePort}`,
  nodeWS: `ws://127.0.0.1:${nodePort}`,
  faucet: '',
  proofServer: `http://127.0.0.1:${proofPort}`,
};

type CovenantCircuits = 'advanceSnapshot' | 'verifyAndApprove';
type SmokePrivateState = Record<string, never>;
type SmokeProviders = MidnightProviders<CovenantCircuits, typeof PRIVATE_STATE_ID, SmokePrivateState>;

class LocalWallet implements WalletProvider, MidnightProvider {
  private constructor(
    readonly wallet: WalletFacade,
    private readonly shieldedKeys: ZswapSecretKeys,
    private readonly dustKey: DustSecretKey,
    private readonly unshieldedKeystore: UnshieldedKeystore,
  ) {}

  static async create(): Promise<LocalWallet> {
    const dustOptions: DustWalletOptions = {
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: 1_000n,
      feeBlocksMargin: 5,
    };
    const result = await FluentWalletBuilder.forEnvironment(environment)
      .withDustOptions(dustOptions)
      .withSeed(GENESIS_WALLET_SEED)
      .buildWithoutStarting();
    const keys = result as typeof result & {
      seeds: { shielded: Uint8Array; dust: Uint8Array };
      keystore: UnshieldedKeystore;
    };
    const wallet = new LocalWallet(
      result.wallet,
      ZswapSecretKeys.fromSeed(keys.seeds.shielded),
      DustSecretKey.fromSeed(keys.seeds.dust),
      keys.keystore,
    );
    await wallet.wallet.start(wallet.shieldedKeys, wallet.dustKey);
    await wallet.waitUntilSynced();
    return wallet;
  }

  getCoinPublicKey(): CoinPublicKey {
    return this.shieldedKeys.coinPublicKey;
  }

  getEncryptionPublicKey(): EncPublicKey {
    return this.shieldedKeys.encryptionPublicKey;
  }

  async balanceTx(tx: UnboundTransaction, ttl: Date = ttlOneHour()): Promise<FinalizedTransaction> {
    const recipe = await this.wallet.balanceUnboundTransaction(
      tx,
      { shieldedSecretKeys: this.shieldedKeys, dustSecretKey: this.dustKey },
      { ttl },
    );
    const signed = await this.wallet.signRecipe(recipe, (payload) => this.unshieldedKeystore.signData(payload));
    return this.wallet.finalizeRecipe(signed);
  }

  submitTx(tx: FinalizedTransaction): Promise<string> {
    return this.wallet.submitTransaction(tx);
  }

  stop(): Promise<void> {
    return this.wallet.stop();
  }

  private async waitUntilSynced(): Promise<void> {
    await Rx.firstValueFrom(
      this.wallet.state().pipe(
        Rx.filter((state) =>
          isComplete(state.shielded.state.progress) &&
          isComplete(state.unshielded.progress) &&
          isComplete(state.dust.state.progress),
        ),
        Rx.timeout({ first: 10 * 60_000 }),
      ),
    );
  }
}

function isComplete(progress: unknown): boolean {
  if (!progress || typeof progress !== 'object') return false;
  const method = (progress as { isStrictlyComplete?: unknown }).isStrictlyComplete;
  return typeof method === 'function' && (method as () => boolean).call(progress);
}

async function expectRejection(action: () => Promise<unknown>, expectedCode: string) {
  try {
    await action();
  } catch (error) {
    const messages: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    }
    if (messages.some((message) => message.includes(expectedCode))) return expectedCode;
    throw new Error(`Expected ${expectedCode}, received ${messages.join(' | ') || String(error)}`);
  }
  throw new Error(`Expected ${expectedCode}, but the circuit call succeeded.`);
}

async function main() {
  setNetworkId(NETWORK_ID);
  const wallet = await LocalWallet.create();

  try {
    const zkConfigProvider = new NodeZkConfigProvider<CovenantCircuits>(zkConfigPath);
    const providers: SmokeProviders = {
      privateStateProvider: levelPrivateStateProvider({
        midnightDbName: path.join(runtimeDir, `private-state-${Date.now()}`),
        privateStateStoreName: 'smoke-private-states',
        privateStoragePasswordProvider: () => 'Covenant-smoke-password-2026!',
        accountId: wallet.getCoinPublicKey(),
      }),
      publicDataProvider: indexerPublicDataProvider(environment.indexer, environment.indexerWS),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(environment.proofServer, zkConfigProvider),
      walletProvider: wallet,
      midnightProvider: wallet,
    };

    const compiledContract = CompiledContract.make('CovenantWatch', Contract).pipe(
      CompiledContract.withVacantWitnesses,
      CompiledContract.withCompiledFileAssets(zkConfigPath),
    );
    const adminSecret = randomBytes(32);
    const companySecret = randomBytes(32);
    const companyId = randomBytes(32);
    const blinding = randomBytes(32);
    const initialCommitment = pureCircuits.makeSnapshotCommitment(companyId, 1n, 150n, 100n, blinding);

    const startedAt = Date.now();
    const deployed = await deployContract(providers, {
      compiledContract,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: {},
      args: [adminSecret, companySecret, companyId, initialCommitment],
    });
    const deployment = deployed.deployTxData.public;
    const initialState = await providers.publicDataProvider.queryContractState(deployment.contractAddress);
    if (!initialState) throw new Error('Deployed contract state was not returned by the indexer.');
    const decodedInitial = decodeLedger(initialState.data);

    const approval = await deployed.callTx.verifyAndApprove(
      companyId,
      1n,
      150n,
      100n,
      blinding,
      companySecret,
    );
    const stateAfterApproval = await providers.publicDataProvider.queryContractState(deployment.contractAddress);
    if (!stateAfterApproval) throw new Error('Approved contract state was not returned by the indexer.');
    const decodedApproved = decodeLedger(stateAfterApproval.data);

    if (decodedInitial.currentRound !== 1n || decodedInitial.approvedRound !== 0n) {
      throw new Error('Unexpected initial ledger state.');
    }
    if (decodedApproved.currentRound !== 1n || decodedApproved.approvedRound !== 1n) {
      throw new Error('Approval was not reflected in the public ledger state.');
    }

    let finalState = decodedApproved;
    let demoScenes: Record<string, unknown> | undefined;

    if (fullDemo) {
      const roundTwoBlinding = randomBytes(32);
      const roundTwoCommitment = pureCircuits.makeSnapshotCommitment(
        companyId,
        2n,
        90n,
        100n,
        roundTwoBlinding,
      );
      const advance = await deployed.callTx.advanceSnapshot(roundTwoCommitment, adminSecret);
      const advancedState = await providers.publicDataProvider.queryContractState(deployment.contractAddress);
      if (!advancedState) throw new Error('Advanced contract state was not returned by the indexer.');
      const decodedAdvanced = decodeLedger(advancedState.data);
      if (decodedAdvanced.currentRound !== 2n || decodedAdvanced.approvedRound !== 1n) {
        throw new Error('Advancing the snapshot did not preserve the prior approval.');
      }

      const insufficientCode = await expectRejection(
        () => deployed.callTx.verifyAndApprove(
          companyId,
          2n,
          90n,
          100n,
          roundTwoBlinding,
          companySecret,
        ),
        'INSUFFICIENT_CASH',
      );
      const staleCode = await expectRejection(
        () => deployed.callTx.verifyAndApprove(companyId, 1n, 150n, 100n, blinding, companySecret),
        'STALE_DATA',
      );
      const rejectedState = await providers.publicDataProvider.queryContractState(deployment.contractAddress);
      if (!rejectedState) throw new Error('Final contract state was not returned by the indexer.');
      finalState = decodeLedger(rejectedState.data);
      if (finalState.currentRound !== 2n || finalState.approvedRound !== 1n) {
        throw new Error('A rejected proof changed the public approval state.');
      }
      demoScenes = {
        roundOneApproval: { status: 'confirmed', transactionId: approval.public.txId },
        roundTwoAdvance: { status: 'confirmed', transactionId: advance.public.txId },
        insufficientCash: { status: 'rejected', code: insufficientCode, transactionId: null },
        staleSnapshot: { status: 'rejected', code: staleCode, transactionId: null },
      };
    }

    const receipt = {
      ok: true,
      checkedAt: new Date().toISOString(),
      network: NETWORK_ID,
      contractAddress: deployment.contractAddress,
      deploymentTxId: deployment.txId,
      approvalTxId: approval.public.txId,
      approvalBlockHeight: approval.public.blockHeight.toString(),
      ...(demoScenes ? { scenes: demoScenes } : {}),
      state: {
        currentRound: finalState.currentRound.toString(),
        approvedRound: finalState.approvedRound.toString(),
        snapshotCommitment: Buffer.from(finalState.snapshotCommitment).toString('hex'),
      },
      elapsedMs: Date.now() - startedAt,
    };
    mkdirSync(runtimeDir, { recursive: true });
    const receiptName = fullDemo ? 'phase2-demo.json' : 'phase0-smoke.json';
    writeFileSync(path.join(runtimeDir, receiptName), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    await wallet.stop();
  }
}

await main();
