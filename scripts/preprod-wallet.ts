import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DustAddress,
  DustWallet,
  HDWallet,
  InMemoryTransactionHistoryStorage,
  MidnightBech32m,
  Roles,
  ShieldedWallet,
  UnshieldedWallet,
  WalletEntrySchema,
  createKeystore,
  generateRandomSeed,
  mergeWalletEntries,
  type DefaultConfiguration,
  type UnshieldedKeystore,
  type WalletFacade,
} from '@midnight-ntwrk/wallet-sdk';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  DustSecretKey,
  LedgerParameters,
  ZswapSecretKeys,
  unshieldedToken,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { type DustWalletOptions, WalletFactory, WalletSeeds } from '@midnight-ntwrk/testkit-js';
import * as Rx from 'rxjs';
import { getMidnightEnvironment } from '../src/lib/server/midnight-environment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environmentFile = path.join(root, '.env.preprod');
const exampleFile = path.join(root, '.env.preprod.example');
const command = process.argv[2] ?? 'address';

if (command === 'init') initialize();
else if (command === 'address') printAddress();
else if (command === 'register') await registerForDust();
else throw new Error(
  'Usage: pnpm preprod:wallet:init, pnpm preprod:wallet:address, or pnpm preprod:wallet:register',
);

function initialize() {
  if (existsSync(environmentFile)) {
    throw new Error('.env.preprod already exists. Refusing to replace the existing wallet.');
  }
  const seed = Buffer.from(generateRandomSeed()).toString('hex');
  const password = randomBytes(32).toString('base64url');
  const template = readFileSync(exampleFile, 'utf8');
  const contents = template
    .replace(/^MIDNIGHT_WALLET_SEED=.*$/m, `MIDNIGHT_WALLET_SEED=${seed}`)
    .replace(/^MIDNIGHT_PRIVATE_STATE_PASSWORD=.*$/m, `MIDNIGHT_PRIVATE_STATE_PASSWORD=${password}`);
  const temporaryFile = `${environmentFile}.${process.pid}.tmp`;
  writeFileSync(temporaryFile, contents, { mode: 0o600, flag: 'wx' });
  renameSync(temporaryFile, environmentFile);
  chmodSync(environmentFile, 0o600);
  console.log(`Created ${environmentFile} with mode 0600.`);
  console.log(`Preprod funding address: ${walletAddress(seed)}`);
  console.log('The wallet seed was not printed. Back up .env.preprod securely before funding it.');
}

function printAddress() {
  const values = parseEnvironmentFile(environmentFile);
  const seed = values.MIDNIGHT_WALLET_SEED;
  if (!seed) throw new Error('MIDNIGHT_WALLET_SEED is missing from .env.preprod.');
  console.log(`Preprod funding address: ${walletAddress(seed)}`);
}

async function registerForDust() {
  warnWhenNodeVersionDiffers();
  const values = existsSync(environmentFile)
    ? { ...parseEnvironmentFile(environmentFile), ...process.env }
    : process.env;
  const seed = values.MIDNIGHT_WALLET_SEED;
  if (!seed) throw new Error('MIDNIGHT_WALLET_SEED is missing from .env.preprod.');
  if (!/^[0-9a-f]{64}$/i.test(seed)) {
    throw new Error('MIDNIGHT_WALLET_SEED must be a 64-character hexadecimal seed.');
  }

  setNetworkId('preprod');
  const environment = getMidnightEnvironment({
    MIDNIGHT_NETWORK_ID: 'preprod',
    MIDNIGHT_PROOF_SERVER_URL: process.env.MIDNIGHT_PROOF_SERVER_URL
      ?? `http://127.0.0.1:${process.env.COVENANT_PROOF_PORT ?? '16300'}`,
  });
  const dustOptions: DustWalletOptions = {
    ledgerParams: LedgerParameters.initialParameters(),
    additionalFeeOverhead: 300_000_000_000_000n,
    feeBlocksMargin: 5,
  };
  const stateFiles = walletStateFiles(seed);
  const result = await buildRegistrationWallet(environment, seed, dustOptions, stateFiles);
  const keys = result as typeof result & {
    seeds: { shielded: Uint8Array; dust: Uint8Array };
    keystore: UnshieldedKeystore;
    wallet: WalletFacade;
  };
  const dustKey = DustSecretKey.fromSeed(keys.seeds.dust);
  const shieldedKeys = ZswapSecretKeys.fromSeed(keys.seeds.shielded);
  await keys.wallet.start(shieldedKeys, dustKey);
  const checkpoint = createWalletCheckpoint(keys.wallet, stateFiles);

  try {
    console.log(`Preprod funding address: ${keys.keystore.getBech32Address()}`);
    console.log('Synchronizing the Preprod wallet from its saved checkpoint...');
    const state = await waitForWallet(keys.wallet);
    await checkpoint.save();
    const nightBalance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
    if (nightBalance <= 0n) {
      throw new Error('No confirmed tNIGHT found. Fund the printed address from the Preprod faucet first.');
    }
    console.log(`Confirmed tNIGHT: ${formatNight(nightBalance)}`);

    const unregistered = state.unshielded.availableCoins.filter(
      (coin) => coin.meta?.registeredForDustGeneration !== true,
    );
    if (unregistered.length > 0) {
      const target = String(DustAddress.encodePublicKey('preprod', state.dust.publicKey));
      const receiver = MidnightBech32m.parse(target).decode(DustAddress, 'preprod');
      const recipe = await keys.wallet.registerNightUtxosForDustGeneration(
        unregistered,
        keys.keystore.getPublicKey(),
        (payload) => keys.keystore.signData(payload),
        receiver,
      );
      const finalized = await keys.wallet.finalizeRecipe(recipe);
      const transactionId = await keys.wallet.submitTransaction(finalized);
      console.log(`DUST registration transaction: ${transactionId}`);
    } else {
      console.log('All confirmed tNIGHT outputs are already registered for DUST generation.');
    }

    console.log('DUST registration submitted. Waiting for the generated balance...');
    const funded = await Rx.firstValueFrom(keys.wallet.state().pipe(
      Rx.filter((walletState) => walletState.isSynced && walletState.dust.balance(new Date()) > 0n),
      Rx.timeout({ first: 10 * 60_000 }),
    ));
    await checkpoint.save();
    console.log(`Available DUST: ${formatDust(funded.dust.balance(new Date()))}`);
  } finally {
    await checkpoint.close();
    await keys.wallet.stop();
  }
}

async function buildRegistrationWallet(
  environment: ReturnType<typeof getMidnightEnvironment>,
  seed: string,
  dustOptions: DustWalletOptions,
  stateFiles: ReturnType<typeof walletStateFiles>,
) {
  const seeds = WalletSeeds.fromMasterSeed(seed);
  const keystore = createKeystore(seeds.unshielded, 'preprod');
  const configuration: DefaultConfiguration = {
    indexerClientConnection: {
      indexerHttpUrl: environment.indexer,
      indexerWsUrl: environment.indexerWS,
    },
    provingServerUrl: new URL(environment.proofServer),
    networkId: environment.walletNetworkId,
    relayURL: new URL(environment.nodeWS),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
    costParameters: {
      ledgerParams: dustOptions.ledgerParams,
      additionalFeeOverhead: dustOptions.additionalFeeOverhead,
      feeBlocksMargin: dustOptions.feeBlocksMargin,
    },
  };
  const shielded = existsSync(stateFiles.shielded)
    ? ShieldedWallet(configuration).restore(readFileSync(stateFiles.shielded, 'utf8'))
    : WalletFactory.createShieldedWallet(configuration, seeds.shielded);
  const unshielded = existsSync(stateFiles.unshielded)
    ? UnshieldedWallet(configuration).restore(readFileSync(stateFiles.unshielded, 'utf8'))
    : WalletFactory.createUnshieldedWallet(configuration, keystore);
  const dust = existsSync(stateFiles.dust)
    ? DustWallet(configuration).restore(readFileSync(stateFiles.dust, 'utf8'))
    : WalletFactory.createDustWallet(configuration, seeds.dust, dustOptions);
  const restored = Object.entries(stateFiles)
    .filter(([, file]) => existsSync(file))
    .map(([kind]) => kind);
  if (restored.length > 0) console.log(`Restored wallet checkpoints: ${restored.join(', ')}`);
  const wallet = await WalletFactory.createWalletFacade(configuration, shielded, unshielded, dust);
  return { wallet, seeds, keystore };
}

async function waitForWallet(wallet: WalletFacade) {
  const overallTimeoutMs = readPositiveDuration('PREPROD_SYNC_TIMEOUT_MS', 120 * 60_000);
  const stallTimeoutMs = readPositiveDuration('PREPROD_SYNC_STALL_TIMEOUT_MS', 5 * 60_000);
  const logIntervalMs = readPositiveDuration('PREPROD_SYNC_LOG_INTERVAL_MS', 10_000);
  let latest = 'waiting for the first wallet state';
  let fingerprint = '';
  let lastChangeAt = Date.now();

  const progress = wallet.state().subscribe(
    (state) => {
      const shieldedProgress = state.shielded.state.progress;
      const nightProgress = state.unshielded.progress;
      const dustProgress = state.dust.state.progress;
      latest = [
        `shielded ${shieldedProgress.appliedIndex}/${shieldedProgress.highestRelevantWalletIndex}`,
        `NIGHT ${nightProgress.appliedId}/${nightProgress.highestTransactionId}`,
        `DUST ${dustProgress.appliedIndex}/${dustProgress.highestRelevantWalletIndex}`,
        `connected=${shieldedProgress.isConnected && nightProgress.isConnected && dustProgress.isConnected}`,
      ].join(' · ');
      if (latest !== fingerprint) {
        fingerprint = latest;
        lastChangeAt = Date.now();
      }
    },
  );
  const progressTimer = setInterval(() => console.log(`Sync progress: ${latest}`), logIntervalMs);

  let stallTimer: NodeJS.Timeout | undefined;
  let overallTimer: NodeJS.Timeout | undefined;
  const watchdog = new Promise<never>((_, reject) => {
    stallTimer = setInterval(() => {
      if (Date.now() - lastChangeAt >= stallTimeoutMs) {
        reject(new Error(
          `Wallet sync made no observable progress for ${formatDuration(stallTimeoutMs)}. Last state: ${latest}`,
        ));
      }
    }, Math.min(logIntervalMs, 10_000));
    overallTimer = setTimeout(() => {
      reject(new Error(
        `Wallet sync exceeded ${formatDuration(overallTimeoutMs)}. Last state: ${latest}`,
      ));
    }, overallTimeoutMs);
  });

  try {
    return await Promise.race([
      wallet.waitForSyncedState(),
      watchdog,
    ]);
  } finally {
    progress.unsubscribe();
    clearInterval(progressTimer);
    if (stallTimer) clearInterval(stallTimer);
    if (overallTimer) clearTimeout(overallTimer);
  }
}

function createWalletCheckpoint(wallet: WalletFacade, stateFiles: ReturnType<typeof walletStateFiles>) {
  let active: Promise<void> | null = null;
  const save = async () => {
    if (active) return active;
    active = (async () => {
      const states = await Promise.all([
        wallet.shielded.serializeState(),
        wallet.unshielded.serializeState(),
        wallet.dust.serializeState(),
      ]);
      mkdirSync(path.dirname(stateFiles.dust), { recursive: true, mode: 0o700 });
      for (const [kind, state] of Object.entries({
        shielded: states[0],
        unshielded: states[1],
        dust: states[2],
      })) {
        const stateFile = stateFiles[kind as keyof typeof stateFiles];
        const temporaryFile = `${stateFile}.${process.pid}.tmp`;
        writeFileSync(temporaryFile, state, { mode: 0o600 });
        renameSync(temporaryFile, stateFile);
        chmodSync(stateFile, 0o600);
      }
    })().finally(() => { active = null; });
    return active;
  };
  const timer = setInterval(() => {
    void save().catch((error) => console.warn(`Could not save DUST checkpoint: ${String(error)}`));
  }, 60_000);
  return {
    save,
    async close() {
      clearInterval(timer);
      await save();
    },
  };
}

function walletStateFiles(seed: string) {
  const walletId = createHash('sha256').update(seed).digest('hex').slice(0, 16);
  const runtimeDirectory = process.env.COVENANT_RUNTIME_DIR
    ?? path.join(root, '.covenant-runtime');
  return {
    shielded: path.join(runtimeDirectory, `preprod-shielded-${walletId}.state`),
    unshielded: path.join(runtimeDirectory, `preprod-unshielded-${walletId}.state`),
    dust: path.join(runtimeDirectory, `preprod-dust-${walletId}.state`),
  };
}

function readPositiveDuration(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer in milliseconds.`);
  }
  return value;
}

function formatDuration(milliseconds: number) {
  return `${Math.ceil(milliseconds / 60_000)} minute(s)`;
}

function warnWhenNodeVersionDiffers() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major !== 22) {
    console.warn(
      `Warning: Node ${process.versions.node} is active; this project is pinned to Node 22.17.1 in .nvmrc.`,
    );
  }
}

function walletAddress(seed: string) {
  if (!/^[0-9a-f]{64}$/i.test(seed)) {
    throw new Error('MIDNIGHT_WALLET_SEED must be a 64-character hexadecimal seed.');
  }
  setNetworkId('preprod');
  const result = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (result.type !== 'seedOk') throw new Error('MIDNIGHT_WALLET_SEED is invalid.');
  try {
    const derived = result.hdWallet
      .selectAccount(0)
      .selectRoles([Roles.NightExternal])
      .deriveKeysAt(0);
    if (derived.type !== 'keysDerived') throw new Error('Could not derive the Preprod wallet key.');
    return String(createKeystore(derived.keys[Roles.NightExternal], 'preprod').getBech32Address());
  } finally {
    result.hdWallet.clear();
  }
}

function parseEnvironmentFile(filePath: string) {
  if (!existsSync(filePath)) {
    throw new Error('.env.preprod does not exist. Run pnpm preprod:wallet:init first.');
  }
  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return separator < 0 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function formatNight(raw: bigint) {
  return `${raw / 1_000_000n}.${(raw % 1_000_000n).toString().padStart(6, '0')}`;
}

function formatDust(raw: bigint) {
  return `${raw / 1_000_000_000_000_000n}.${(raw % 1_000_000_000_000_000n).toString().padStart(15, '0')}`;
}
