export const CONTRACT_NAME = 'covenant-watch';

export interface CovenantPrivateState {
  readonly adminSecret: Uint8Array;
  readonly companySecret: Uint8Array;
  readonly companyId: Uint8Array;
  readonly round: bigint;
  readonly unrestrictedCash: bigint;
  readonly scheduledPayments: bigint;
  readonly blinding: Uint8Array;
}

/**
 * The generated contract bindings are emitted to src/managed by
 * `pnpm contract:compile`. They are intentionally gitignored because they
 * include version-specific proving artifacts.
 */
export type ContractBuildStatus = 'requires-compact-compile' | 'compiled';
