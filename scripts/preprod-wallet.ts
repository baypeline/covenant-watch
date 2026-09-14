import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DustAddress,
  HDWallet,
  MidnightBech32m,
  Roles,
  createKeystore,
  generateRandomSeed,
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
import type { DustWalletOptions } from '@midnight-ntwrk/testkit-js';
import * as Rx from 'rxjs';
import { getMidnightEnvironment } from '../src/lib/server/midnight-environment.js';
import {
  buildPersistentWallet,
  createWalletCheckpoint,
  waitForWalletSync,
} from '../src/lib/server/persistent-wallet.js';

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
  const result = await buildPersistentWallet(environment, seed, dustOptions);
  const keys = result as typeof result & {
    seeds: { shielded: Uint8Array; dust: Uint8Array };
    keystore: UnshieldedKeystore;
    wallet: WalletFacade;
  };
  const dustKey = DustSecretKey.fromSeed(keys.seeds.dust);
  const shieldedKeys = ZswapSecretKeys.fromSeed(keys.seeds.shielded);
  await keys.wallet.start(shieldedKeys, dustKey);
  const checkpoint = createWalletCheckpoint(keys.wallet, result.stateFiles);

  try {
    console.log(`Preprod funding address: ${keys.keystore.getBech32Address()}`);
    console.log('Synchronizing the Preprod wallet from its saved checkpoint...');
    const state = await waitForWalletSync(keys.wallet);
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
    try {
      await checkpoint.close();
    } finally {
      await keys.wallet.stop();
    }
  }
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
