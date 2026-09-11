import { describe, expect, it } from 'vitest';
import { evaluateAdvance, evaluateCovenant, MAX_AMOUNT, type ModelInput } from './model.js';

const valid: ModelInput = {
  authorized: true,
  currentRound: 1n,
  approvedRound: 0n,
  submittedRound: 1n,
  commitmentMatches: true,
  cash: 150n,
  payments: 100n,
};

describe('Covenant Watch model', () => {
  it.each([
    { ...valid, cash: 150n, payments: 100n },
    { ...valid, cash: 120n, payments: 100n },
    { ...valid, cash: MAX_AMOUNT, payments: 833_333n },
  ])('approves valid and inclusive boundary inputs', (input) => {
    expect(evaluateCovenant(input)).toBeNull();
  });

  it.each([
    [{ ...valid, cash: 119n }, 'INSUFFICIENT_CASH'],
    [{ ...valid, currentRound: 2n }, 'STALE_DATA'],
    [{ ...valid, commitmentMatches: false }, 'DATA_MISMATCH'],
    [{ ...valid, authorized: false }, 'UNAUTHORIZED'],
    [{ ...valid, approvedRound: 1n }, 'ALREADY_APPROVED'],
    [{ ...valid, payments: 0n }, 'INVALID_PAYMENT_AMOUNT'],
    [{ ...valid, payments: -1n }, 'INVALID_PAYMENT_AMOUNT'],
    [{ ...valid, cash: -1n }, 'AMOUNT_OUT_OF_RANGE'],
    [{ ...valid, cash: MAX_AMOUNT + 1n }, 'AMOUNT_OUT_OF_RANGE'],
    [{ ...valid, payments: MAX_AMOUNT + 1n }, 'AMOUNT_OUT_OF_RANGE'],
  ] as const)('rejects invalid and out-of-range input', (input, error) => {
    expect(evaluateCovenant(input)).toBe(error);
  });

  it('applies authorization, freshness, and commitment checks before financial rules', () => {
    expect(evaluateCovenant({ ...valid, authorized: false, payments: 0n })).toBe('UNAUTHORIZED');
    expect(evaluateCovenant({ ...valid, submittedRound: 2n, payments: 0n })).toBe('STALE_DATA');
    expect(evaluateCovenant({ ...valid, commitmentMatches: false, payments: 0n })).toBe('DATA_MISMATCH');
  });
});

describe('Covenant Watch advance model', () => {
  it('allows an authorized advance below the round limit', () => {
    expect(evaluateAdvance(true, 65_534n)).toBeNull();
  });

  it('rejects unauthorized and overflowing advances', () => {
    expect(evaluateAdvance(false, 1n)).toBe('UNAUTHORIZED');
    expect(evaluateAdvance(true, 65_535n)).toBe('ROUND_LIMIT_REACHED');
  });
});
