import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DustWallet,
  InMemoryTransactionHistoryStorage,
  ShieldedWallet,
  UnshieldedWallet,
  WalletEntrySchema,
  createKeystore,
  mergeWalletEntries,
  type DefaultConfiguration,
  type WalletFacade,
} from '@midnight-ntwrk/wallet-sdk';
import {
  type DustWalletOptions,
  type EnvironmentConfiguration,
  WalletFactory,
  WalletSeeds,
} from '@midnight-ntwrk/testkit-js';

export interface WalletStateFiles {
  shielded: string;
  unshielded: string;
  dust: string;
}

export interface WalletSyncOptions {
  timeoutMs?: number;
  stallTimeoutMs?: number;
  logIntervalMs?: number;
  logger?: Pick<Console, 'log' | 'warn'>;
}

export async function buildPersistentWallet(
  environment: EnvironmentConfiguration,
  seed: string,
  dustOptions: DustWalletOptions,
) {
  const seeds = WalletSeeds.fromMasterSeed(seed);
  const keystore = createKeystore(seeds.unshielded, environment.walletNetworkId);
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
      additionalFeeOverhead: dustOptions.additionalFeeOverhead,
      feeBlocksMargin: dustOptions.feeBlocksMargin,
    },
  };
  const stateFiles = walletStateFiles(seed, environment.walletNetworkId);
  const shielded = existsSync(/* turbopackIgnore: true */ stateFiles.shielded)
    ? ShieldedWallet(configuration).restore(
        readFileSync(/* turbopackIgnore: true */ stateFiles.shielded, 'utf8'),
      )
    : WalletFactory.createShieldedWallet(configuration, seeds.shielded);
  const unshielded = existsSync(/* turbopackIgnore: true */ stateFiles.unshielded)
    ? UnshieldedWallet(configuration).restore(
        readFileSync(/* turbopackIgnore: true */ stateFiles.unshielded, 'utf8'),
      )
    : WalletFactory.createUnshieldedWallet(configuration, keystore);
  const dust = existsSync(/* turbopackIgnore: true */ stateFiles.dust)
    ? DustWallet(configuration).restore(
        readFileSync(/* turbopackIgnore: true */ stateFiles.dust, 'utf8'),
      )
    : WalletFactory.createDustWallet(configuration, seeds.dust, dustOptions);
  const restored = Object.entries(stateFiles)
    .filter(([, file]) => existsSync(/* turbopackIgnore: true */ file))
    .map(([kind]) => kind);
  if (restored.length > 0) console.log(`Restored wallet checkpoints: ${restored.join(', ')}`);
  const wallet = await WalletFactory.createWalletFacade(configuration, shielded, unshielded, dust);
  return { wallet, seeds, keystore, stateFiles };
}

export async function waitForWalletSync(wallet: WalletFacade, options: WalletSyncOptions = {}) {
  const logger = options.logger ?? console;
  const timeoutMs = options.timeoutMs
    ?? readPositiveDuration('MIDNIGHT_WALLET_SYNC_TIMEOUT_MS', 120 * 60_000);
  const stallTimeoutMs = options.stallTimeoutMs
    ?? readPositiveDuration('MIDNIGHT_WALLET_SYNC_STALL_TIMEOUT_MS', 5 * 60_000);
  const logIntervalMs = options.logIntervalMs
    ?? readPositiveDuration('MIDNIGHT_WALLET_SYNC_LOG_INTERVAL_MS', 10_000);
  let latest = 'waiting for the first wallet state';
  let fingerprint = '';
  let lastChangeAt = Date.now();

  const progress = wallet.state().subscribe((state) => {
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
  });
  const progressTimer = setInterval(() => logger.log(`Sync progress: ${latest}`), logIntervalMs);

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
      reject(new Error(`Wallet sync exceeded ${formatDuration(timeoutMs)}. Last state: ${latest}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([wallet.waitForSyncedState(), watchdog]);
  } finally {
    progress.unsubscribe();
    clearInterval(progressTimer);
    if (stallTimer) clearInterval(stallTimer);
    if (overallTimer) clearTimeout(overallTimer);
  }
}

export function createWalletCheckpoint(
  wallet: WalletFacade,
  stateFiles: WalletStateFiles,
  options: Pick<WalletSyncOptions, 'logger'> & { intervalMs?: number } = {},
) {
  const logger = options.logger ?? console;
  const intervalMs = options.intervalMs
    ?? readPositiveDuration('MIDNIGHT_WALLET_CHECKPOINT_INTERVAL_MS', 60_000);
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
        const stateFile = stateFiles[kind as keyof WalletStateFiles];
        const temporaryFile = `${stateFile}.${process.pid}.tmp`;
        writeFileSync(temporaryFile, state, { mode: 0o600 });
        renameSync(temporaryFile, stateFile);
        chmodSync(stateFile, 0o600);
      }
    })().finally(() => { active = null; });
    return active;
  };
  const timer = setInterval(() => {
    void save().catch((error) => logger.warn(`Could not save wallet checkpoint: ${String(error)}`));
  }, intervalMs);
  timer.unref();
  return {
    save,
    async close() {
      clearInterval(timer);
      await save();
    },
  };
}

function walletStateFiles(seed: string, networkId: string): WalletStateFiles {
  const walletId = createHash('sha256').update(seed).digest('hex').slice(0, 16);
  const runtimeDirectory = process.env.COVENANT_RUNTIME_DIR
    ?? path.join(process.cwd(), '.covenant-runtime');
  const safeNetworkId = networkId.replace(/[^a-z0-9_-]/gi, '-');
  return {
    shielded: path.join(runtimeDirectory, `${safeNetworkId}-shielded-${walletId}.state`),
    unshielded: path.join(runtimeDirectory, `${safeNetworkId}-unshielded-${walletId}.state`),
    dust: path.join(runtimeDirectory, `${safeNetworkId}-dust-${walletId}.state`),
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
