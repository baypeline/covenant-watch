import {
  CompactTypeUnsignedInteger,
  ContractState,
  StateValue,
  createCircuitContext,
  createConstructorContext,
  queryLedgerState,
  sampleContractAddress,
  type ChargedState,
} from '@midnight-ntwrk/compact-runtime';
import { describe, expect, it } from 'vitest';

import {
  Contract,
  ledger,
  pureCircuits,
} from './managed/covenant-watch/contract/index.js';

type PrivateState = Record<string, never>;

const bytes = (value: number) => new Uint8Array(32).fill(value);
const adminSecret = bytes(1);
const companySecret = bytes(2);
const companyId = bytes(3);
const blinding = bytes(4);
const coinPublicKey = { bytes: bytes(9) };

interface Fixture {
  readonly contract: Contract<PrivateState>;
  state: ContractState | ChargedState;
  commitment: Uint8Array;
}

function createFixture(cash = 150n, payments = 100n): Fixture {
  const contract = new Contract<PrivateState>({});
  const commitment = pureCircuits.makeSnapshotCommitment(companyId, 1n, cash, payments, blinding);
  const initial = contract.initialState(
    createConstructorContext({}, coinPublicKey),
    adminSecret,
    companySecret,
    companyId,
    commitment,
  );
  return { contract, state: initial.currentContractState, commitment };
}

function decoded(fixture: Fixture) {
  return ledger(fixture.state instanceof ContractState ? fixture.state.data : fixture.state);
}

function verify(
  fixture: Fixture,
  overrides: Partial<{
    submittedCompanyId: Uint8Array;
    submittedRound: bigint;
    cash: bigint;
    payments: bigint;
    blinding: Uint8Array;
    companySecret: Uint8Array;
  }> = {},
) {
  const result = fixture.contract.circuits.verifyAndApprove(
    createCircuitContext(sampleContractAddress(), coinPublicKey, fixture.state, {}),
    overrides.submittedCompanyId ?? companyId,
    overrides.submittedRound ?? 1n,
    overrides.cash ?? 150n,
    overrides.payments ?? 100n,
    overrides.blinding ?? blinding,
    overrides.companySecret ?? companySecret,
  );
  fixture.state = result.context.currentQueryContext.state;
  return result;
}

function advance(fixture: Fixture, newCommitment: Uint8Array, secret = adminSecret) {
  const result = fixture.contract.circuits.advanceSnapshot(
    createCircuitContext(sampleContractAddress(), coinPublicKey, fixture.state, {}),
    newCommitment,
    secret,
  );
  fixture.state = result.context.currentQueryContext.state;
  return result;
}

function setCurrentRoundForBoundaryTest(fixture: Fixture, round: bigint) {
  const context = createCircuitContext(sampleContractAddress(), coinPublicKey, fixture.state, {});
  const uint8 = new CompactTypeUnsignedInteger(255n, 1);
  const uint16 = new CompactTypeUnsignedInteger(65_535n, 2);
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: [],
  };
  queryLedgerState(context, partialProofData, [
    {
      push: {
        storage: false,
        value: StateValue.newCell({ value: uint8.toValue(0n), alignment: uint8.alignment() }).encode(),
      },
    },
    {
      push: {
        storage: true,
        value: StateValue.newCell({ value: uint16.toValue(round), alignment: uint16.alignment() }).encode(),
      },
    },
    { ins: { cached: false, n: 1 } },
  ]);
  fixture.state = context.currentQueryContext.state;
}

describe('generated Compact covenant circuits', () => {
  it('initializes only the approved public state and role public keys', () => {
    const fixture = createFixture();
    const state = decoded(fixture);

    expect(Object.keys(state)).toEqual([
      'currentRound',
      'approvedRound',
      'snapshotCommitment',
      'adminPublicKey',
      'companyPublicKey',
    ]);
    expect(state.currentRound).toBe(1n);
    expect(state.approvedRound).toBe(0n);
    expect(state.snapshotCommitment).toEqual(fixture.commitment);
    expect(state.adminPublicKey).toEqual(pureCircuits.deriveAdminPublicKey(adminSecret));
    expect(state.companyPublicKey).toEqual(pureCircuits.deriveCompanyPublicKey(companyId, companySecret));
  });

  it('binds every private snapshot component into the commitment', () => {
    const baseline = pureCircuits.makeSnapshotCommitment(companyId, 1n, 150n, 100n, blinding);
    const variants = [
      pureCircuits.makeSnapshotCommitment(bytes(30), 1n, 150n, 100n, blinding),
      pureCircuits.makeSnapshotCommitment(companyId, 2n, 150n, 100n, blinding),
      pureCircuits.makeSnapshotCommitment(companyId, 1n, 151n, 100n, blinding),
      pureCircuits.makeSnapshotCommitment(companyId, 1n, 150n, 101n, blinding),
      pureCircuits.makeSnapshotCommitment(companyId, 1n, 150n, 100n, bytes(40)),
    ];

    for (const variant of variants) expect(variant).not.toEqual(baseline);
  });

  it.each([
    [120n, 100n],
    [1_000_000n, 833_333n],
  ])('approves inclusive cash boundaries C=%s P=%s', (cash, payments) => {
    const fixture = createFixture(cash, payments);
    verify(fixture, { cash, payments });
    expect(decoded(fixture).approvedRound).toBe(1n);
  });

  it('rejects the first value below the covenant boundary', () => {
    const fixture = createFixture(119n, 100n);
    expect(() => verify(fixture, { cash: 119n })).toThrow('INSUFFICIENT_CASH');
    expect(decoded(fixture).approvedRound).toBe(0n);
  });

  it.each([
    ['cash', { cash: 151n }],
    ['payments', { payments: 101n }],
    ['blinding', { blinding: bytes(40) }],
  ] as const)('rejects %s tampering against the registered commitment', (_name, override) => {
    const fixture = createFixture();
    expect(() => verify(fixture, override)).toThrow('DATA_MISMATCH');
  });

  it('rejects unauthorized and stale submissions', () => {
    expect(() => verify(createFixture(), { submittedCompanyId: bytes(30) })).toThrow('UNAUTHORIZED');
    expect(() => verify(createFixture(), { companySecret: bytes(20) })).toThrow('UNAUTHORIZED');
    expect(() => verify(createFixture(), { submittedRound: 2n })).toThrow('STALE_DATA');
  });

  it('rejects zero payments and registered amounts above the application limit', () => {
    const zeroPayments = createFixture(0n, 0n);
    expect(() => verify(zeroPayments, { cash: 0n, payments: 0n })).toThrow('INVALID_PAYMENT_AMOUNT');

    const excessCash = createFixture(1_000_001n, 100n);
    expect(() => verify(excessCash, { cash: 1_000_001n })).toThrow('AMOUNT_OUT_OF_RANGE');

    const excessPayments = createFixture(1_000_000n, 1_000_001n);
    expect(() => verify(excessPayments, { cash: 1_000_000n, payments: 1_000_001n })).toThrow('AMOUNT_OUT_OF_RANGE');
  });

  it('rejects negative and Uint<32> overflow values at the generated ABI boundary', () => {
    expect(() => verify(createFixture(), { cash: -1n })).toThrow('Uint<0..4294967296>');
    expect(() => verify(createFixture(), { payments: -1n })).toThrow('Uint<0..4294967296>');
    expect(() => verify(createFixture(), { cash: 4_294_967_296n })).toThrow('Uint<0..4294967296>');
    expect(() => verify(createFixture(), { payments: 4_294_967_296n })).toThrow('Uint<0..4294967296>');
  });

  it('prevents a second approval in the same round', () => {
    const fixture = createFixture();
    verify(fixture);
    expect(() => verify(fixture)).toThrow('ALREADY_APPROVED');
    expect(decoded(fixture).approvedRound).toBe(1n);
  });

  it('requires admin authorization and retains prior approval after advancing', () => {
    const unauthorized = createFixture();
    expect(() => advance(unauthorized, bytes(50), bytes(10))).toThrow('UNAUTHORIZED');

    const fixture = createFixture();
    verify(fixture);
    const nextCommitment = pureCircuits.makeSnapshotCommitment(companyId, 2n, 90n, 100n, bytes(5));
    advance(fixture, nextCommitment);

    expect(decoded(fixture).currentRound).toBe(2n);
    expect(decoded(fixture).approvedRound).toBe(1n);
    expect(decoded(fixture).snapshotCommitment).toEqual(nextCommitment);
  });

  it('rejects advancing beyond the Uint<16> round limit', () => {
    const fixture = createFixture();
    setCurrentRoundForBoundaryTest(fixture, 65_535n);

    expect(() => advance(fixture, bytes(50))).toThrow('ROUND_LIMIT_REACHED');
    expect(decoded(fixture).currentRound).toBe(65_535n);
  });
});
