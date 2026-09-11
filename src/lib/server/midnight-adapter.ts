import 'server-only';

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
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
import type { MidnightProvider, MidnightProviders, UnboundTransaction, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import { type DustWalletOptions, type EnvironmentConfiguration, FluentWalletBuilder } from '@midnight-ntwrk/testkit-js';
import type { UnshieldedKeystore, WalletFacade } from '@midnight-ntwrk/wallet-sdk';
import * as Rx from 'rxjs';
import type { CaseId, CovenantErrorCode, LedgerState, VerifyResponse } from '@/types/covenant';
import { cases } from '@/types/covenant';
import type { CovenantAdapter, VerificationLifecycle } from './covenant-adapter';
import {
  Contract,
  ledger as decodeLedger,
  pureCircuits,
} from '../../../contract/src/managed/covenant-watch/contract/index.js';

type CovenantCircuits = 'advanceSnapshot' | 'verifyAndApprove';
type PrivateState = Record<string, never>;
const PRIVATE_STATE_ID = 'covenantWatchServerPrivateState';
const LOCAL_GENESIS_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

interface RuntimeSecrets {
  version: 1;
  contractAddress: string | null;
  adminSecret: string;
  companySecret: string;
  companyId: string;
  roundOneBlinding: string;
  roundTwoBlinding: string;
  lastTransactionId: string | null;
  updatedAt: string;
}

type Providers = MidnightProviders<CovenantCircuits, typeof PRIVATE_STATE_ID, PrivateState>;
type ConnectedContract = Awaited<ReturnType<typeof deployInitialContract>>;

export async function createMidnightAdapter(): Promise<CovenantAdapter> {
  return MidnightAdapter.create();
}

class MidnightAdapter implements CovenantAdapter {
  readonly mode = 'midnight' as const;

  private constructor(
    private readonly wallet: LocalWallet,
    private readonly providers: Providers,
    private readonly secretsFile: string,
    private secrets: RuntimeSecrets,
    private contract: ConnectedContract,
  ) {}

  static async create() {
    const networkId = process.env.MIDNIGHT_NETWORK_ID ?? 'undeployed';
    setNetworkId(networkId);
    const environment = getEnvironment(networkId);
    const walletSeed = process.env.MIDNIGHT_WALLET_SEED
      || (networkId === 'undeployed' ? LOCAL_GENESIS_SEED : null);
    if (!walletSeed) throw new Error('MIDNIGHT_WALLET_SEED is required outside the undeployed network.');
    const privateStatePassword = process.env.MIDNIGHT_PRIVATE_STATE_PASSWORD
      || (networkId === 'undeployed' ? 'Covenant-local-2026!' : null);
    if (!privateStatePassword) throw new Error('MIDNIGHT_PRIVATE_STATE_PASSWORD is required outside the undeployed network.');

    const runtimeDirectory = process.env.COVENANT_RUNTIME_DIR
      ?? path.join(process.cwd(), '.covenant-runtime');
    const secretsFile = path.join(runtimeDirectory, 'midnight-runtime.json');
    mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
    const wallet = await LocalWallet.create(environment, walletSeed);
    try {
      const zkConfigPath = process.env.MIDNIGHT_ZK_CONFIG_PATH
        ?? path.join(process.cwd(), 'contract', 'src', 'managed', 'covenant-watch');
      const zkConfigProvider = new NodeZkConfigProvider<CovenantCircuits>(zkConfigPath);
      const providers: Providers = {
        privateStateProvider: levelPrivateStateProvider({
          midnightDbName: path.join(runtimeDirectory, 'midnight-level-db'),
          privateStateStoreName: 'server-private-states',
          privateStoragePasswordProvider: () => privateStatePassword,
          accountId: wallet.getCoinPublicKey(),
        }),
        publicDataProvider: indexerPublicDataProvider(environment.indexer, environment.indexerWS),
        zkConfigProvider,
        proofProvider: httpClientProofProvider(environment.proofServer, zkConfigProvider),
        walletProvider: wallet,
        midnightProvider: wallet,
      };
      const secrets = readSecrets(secretsFile) ?? freshSecrets();
      const contract = secrets.contractAddress
        ? await findDeployedContract(providers, {
            compiledContract: compiledContract(zkConfigPath),
            contractAddress: secrets.contractAddress,
            privateStateId: PRIVATE_STATE_ID,
          }) as unknown as ConnectedContract
        : await deployInitialContract(providers, zkConfigPath, secrets, secretsFile);
      if (!secrets.contractAddress) {
        secrets.contractAddress = contract.deployTxData.public.contractAddress;
        secrets.lastTransactionId = contract.deployTxData.public.txId;
        secrets.updatedAt = new Date().toISOString();
        writeSecrets(secretsFile, secrets);
      }
      return new MidnightAdapter(wallet, providers, secretsFile, secrets, contract);
    } catch (error) {
      await wallet.stop();
      throw error;
    }
  }

  async getState() {
    const address = this.contract.deployTxData.public.contractAddress;
    const state = await this.providers.publicDataProvider.queryContractState(address);
    if (!state) throw new Error('Contract state was not returned by the indexer.');
    const ledger = decodeLedger(state.data);
    return {
      mode: this.mode,
      currentRound: Number(ledger.currentRound),
      approvedRound: Number(ledger.approvedRound),
      snapshotCommitment: Buffer.from(ledger.snapshotCommitment).toString('hex'),
      contractAddress: address,
      network: process.env.MIDNIGHT_NETWORK_ID ?? 'undeployed',
      lastTransactionId: this.secrets.lastTransactionId,
      updatedAt: this.secrets.updatedAt,
    } satisfies LedgerState;
  }

  async verify(caseId: CaseId, lifecycle?: VerificationLifecycle): Promise<VerifyResponse> {
    const sample = cases[caseId];
    const blinding = sample.round === 1 ? this.secrets.roundOneBlinding : this.secrets.roundTwoBlinding;
    try {
      const result = await this.wallet.withVerificationLifecycle(lifecycle, () =>
        this.contract.callTx.verifyAndApprove!(
          fromHex(this.secrets.companyId),
          BigInt(sample.round),
          BigInt(sample.cash),
          BigInt(sample.payments),
          fromHex(blinding),
          fromHex(this.secrets.companySecret),
        ));
      this.secrets.lastTransactionId = result.public.txId;
      this.secrets.updatedAt = new Date().toISOString();
      writeSecrets(this.secretsFile, this.secrets);
      return { ok: true, transactionId: result.public.txId, state: await this.getState() };
    } catch (error) {
      const code = covenantError(error);
      if (!code) throw error;
      return { ok: false, code, message: errorMessage(code), state: await this.getState() };
    }
  }

  async advance() {
    const state = await this.getState();
    if (state.currentRound !== 1) return state;
    const sample = cases['round-2-fail'];
    const commitment = pureCircuits.makeSnapshotCommitment(
      fromHex(this.secrets.companyId),
      2n,
      BigInt(sample.cash),
      BigInt(sample.payments),
      fromHex(this.secrets.roundTwoBlinding),
    );
    const result = await this.contract.callTx.advanceSnapshot!(commitment, fromHex(this.secrets.adminSecret));
    this.secrets.lastTransactionId = result.public.txId;
    this.secrets.updatedAt = new Date().toISOString();
    writeSecrets(this.secretsFile, this.secrets);
    return this.getState();
  }

  async reset() {
    this.secrets = freshSecrets();
    this.contract = await deployInitialContract(
      this.providers,
      process.env.MIDNIGHT_ZK_CONFIG_PATH ?? path.join(process.cwd(), 'contract', 'src', 'managed', 'covenant-watch'),
      this.secrets,
      this.secretsFile,
    );
    this.secrets.contractAddress = this.contract.deployTxData.public.contractAddress;
    this.secrets.lastTransactionId = this.contract.deployTxData.public.txId;
    this.secrets.updatedAt = new Date().toISOString();
    writeSecrets(this.secretsFile, this.secrets);
    return this.getState();
  }
}

function compiledContract(zkConfigPath: string) {
  return CompiledContract.make('CovenantWatch', Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
}

async function deployInitialContract(
  providers: Providers,
  zkConfigPath: string,
  secrets: RuntimeSecrets,
  secretsFile: string,
) {
  writeSecrets(secretsFile, secrets);
  const sample = cases['round-1-pass'];
  const initialCommitment = pureCircuits.makeSnapshotCommitment(
    fromHex(secrets.companyId),
    1n,
    BigInt(sample.cash),
    BigInt(sample.payments),
    fromHex(secrets.roundOneBlinding),
  );
  return deployContract(providers, {
    compiledContract: compiledContract(zkConfigPath),
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: {},
    args: [fromHex(secrets.adminSecret), fromHex(secrets.companySecret), fromHex(secrets.companyId), initialCommitment],
  });
}

function getEnvironment(networkId: string): EnvironmentConfiguration {
  const indexer = process.env.MIDNIGHT_INDEXER_URL ?? 'http://127.0.0.1:18088/api/v4/graphql';
  const node = process.env.MIDNIGHT_NODE_URL ?? 'http://127.0.0.1:19944';
  return {
    walletNetworkId: networkId,
    networkId,
    indexer,
    indexerWS: process.env.MIDNIGHT_INDEXER_WS_URL ?? indexer.replace(/^http/, 'ws').replace('/api/v4/graphql', '/api/v4/graphql/ws'),
    node,
    nodeWS: process.env.MIDNIGHT_NODE_WS_URL ?? node.replace(/^http/, 'ws'),
    faucet: '',
    proofServer: process.env.MIDNIGHT_PROOF_SERVER_URL ?? 'http://127.0.0.1:16300',
  };
}

class LocalWallet implements WalletProvider, MidnightProvider {
  private verificationLifecycle?: VerificationLifecycle;

  private constructor(
    readonly wallet: WalletFacade,
    private readonly shieldedKeys: ZswapSecretKeys,
    private readonly dustKey: DustSecretKey,
    private readonly unshieldedKeystore: UnshieldedKeystore,
  ) {}

  static async create(environment: EnvironmentConfiguration, seed: string) {
    const dustOptions: DustWalletOptions = {
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: 1_000n,
      feeBlocksMargin: 5,
    };
    const result = await FluentWalletBuilder.forEnvironment(environment)
      .withDustOptions(dustOptions)
      .withSeed(seed)
      .buildWithoutStarting();
    const keys = result as typeof result & {
      seeds: { shielded: Uint8Array; dust: Uint8Array };
      keystore: UnshieldedKeystore;
    };
    const localWallet = new LocalWallet(
      result.wallet,
      ZswapSecretKeys.fromSeed(keys.seeds.shielded),
      DustSecretKey.fromSeed(keys.seeds.dust),
      keys.keystore,
    );
    await localWallet.wallet.start(localWallet.shieldedKeys, localWallet.dustKey);
    await localWallet.waitUntilSynced();
    return localWallet;
  }

  getCoinPublicKey(): CoinPublicKey { return this.shieldedKeys.coinPublicKey; }
  getEncryptionPublicKey(): EncPublicKey { return this.shieldedKeys.encryptionPublicKey; }

  async balanceTx(tx: UnboundTransaction, ttl: Date = ttlOneHour()): Promise<FinalizedTransaction> {
    const recipe = await this.wallet.balanceUnboundTransaction(
      tx,
      { shieldedSecretKeys: this.shieldedKeys, dustSecretKey: this.dustKey },
      { ttl },
    );
    const signed = await this.wallet.signRecipe(recipe, (payload) => this.unshieldedKeystore.signData(payload));
    return this.wallet.finalizeRecipe(signed);
  }

  async submitTx(tx: FinalizedTransaction) {
    this.verificationLifecycle?.onSubmitting();
    const transactionId = await this.wallet.submitTransaction(tx);
    this.verificationLifecycle?.onSubmitted(transactionId);
    return transactionId;
  }

  async withVerificationLifecycle<T>(lifecycle: VerificationLifecycle | undefined, action: () => Promise<T>) {
    this.verificationLifecycle = lifecycle;
    try {
      return await action();
    } finally {
      this.verificationLifecycle = undefined;
    }
  }
  stop() { return this.wallet.stop(); }

  private async waitUntilSynced() {
    await Rx.firstValueFrom(this.wallet.state().pipe(
      Rx.filter((state) =>
        isComplete(state.shielded.state.progress)
        && isComplete(state.unshielded.progress)
        && isComplete(state.dust.state.progress)),
      Rx.timeout({ first: 10 * 60_000 }),
    ));
  }
}

function isComplete(progress: unknown) {
  if (!progress || typeof progress !== 'object') return false;
  const method = (progress as { isStrictlyComplete?: unknown }).isStrictlyComplete;
  return typeof method === 'function' && (method as () => boolean).call(progress);
}

function freshSecrets(): RuntimeSecrets {
  return {
    version: 1,
    contractAddress: null,
    adminSecret: randomBytes(32).toString('hex'),
    companySecret: randomBytes(32).toString('hex'),
    companyId: randomBytes(32).toString('hex'),
    roundOneBlinding: randomBytes(32).toString('hex'),
    roundTwoBlinding: randomBytes(32).toString('hex'),
    lastTransactionId: null,
    updatedAt: new Date().toISOString(),
  };
}

function readSecrets(filePath: string) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as RuntimeSecrets;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function writeSecrets(filePath: string, secrets: RuntimeSecrets) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, filePath);
}

function fromHex(value: string) { return Uint8Array.from(Buffer.from(value, 'hex')); }

function covenantError(error: unknown): CovenantErrorCode | null {
  const codes: CovenantErrorCode[] = [
    'INSUFFICIENT_CASH', 'STALE_DATA', 'DATA_MISMATCH', 'UNAUTHORIZED', 'ALREADY_APPROVED',
  ];
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return codes.find((code) => messages.some((message) => message.includes(code))) ?? null;
}

function errorMessage(code: CovenantErrorCode) {
  const messages: Record<CovenantErrorCode, string> = {
    INSUFFICIENT_CASH: '현금 여유 기준을 충족하지 못했습니다.',
    STALE_DATA: '현재 검증 기간과 자료의 기간이 다릅니다.',
    DATA_MISMATCH: '현재 원장에 등록된 자료와 일치하지 않습니다.',
    UNAUTHORIZED: '등록된 기업 인증값과 일치하지 않습니다.',
    ALREADY_APPROVED: '이 기간은 이미 승인되었습니다.',
  };
  return messages[code];
}
