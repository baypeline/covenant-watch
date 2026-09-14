import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { WalletFacade } from '@midnight-ntwrk/wallet-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWalletCheckpoint, type WalletStateFiles } from './persistent-wallet';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('wallet checkpoint', () => {
  it('atomically persists every wallet state with owner-only permissions', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'covenant-wallet-'));
    temporaryDirectories.push(directory);
    const stateFiles: WalletStateFiles = {
      shielded: path.join(directory, 'nested', 'preprod-shielded.state'),
      unshielded: path.join(directory, 'nested', 'preprod-unshielded.state'),
      dust: path.join(directory, 'nested', 'preprod-dust.state'),
    };
    const wallet = {
      shielded: { serializeState: vi.fn().mockResolvedValue('shielded-state') },
      unshielded: { serializeState: vi.fn().mockResolvedValue('unshielded-state') },
      dust: { serializeState: vi.fn().mockResolvedValue('dust-state') },
    } as unknown as WalletFacade;
    const checkpoint = createWalletCheckpoint(wallet, stateFiles, { intervalMs: 60_000 });

    await checkpoint.save();

    expect(readFileSync(stateFiles.shielded, 'utf8')).toBe('shielded-state');
    expect(readFileSync(stateFiles.unshielded, 'utf8')).toBe('unshielded-state');
    expect(readFileSync(stateFiles.dust, 'utf8')).toBe('dust-state');
    for (const file of Object.values(stateFiles)) {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
    expect(readdirSync(path.dirname(stateFiles.dust)).sort()).toEqual([
      'preprod-dust.state',
      'preprod-shielded.state',
      'preprod-unshielded.state',
    ]);

    await checkpoint.close();
  });
});
