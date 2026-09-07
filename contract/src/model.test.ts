import { describe, expect, it } from 'vitest';
import { evaluateCovenant, type ModelInput } from './model.js';

const valid: ModelInput = {
  authorized: true,
  currentRound: 1,
  approvedRound: 0,
  submittedRound: 1,
  commitmentMatches: true,
  cash: 150,
  payments: 100,
};

describe('Covenant Watch model', () => {
  it('approves a current, committed snapshot with enough cash', () => {
    expect(evaluateCovenant(valid)).toBeNull();
  });

  it.each([
    [{ ...valid, cash: 90 }, 'INSUFFICIENT_CASH'],
    [{ ...valid, currentRound: 2 }, 'STALE_DATA'],
    [{ ...valid, commitmentMatches: false }, 'DATA_MISMATCH'],
    [{ ...valid, authorized: false }, 'UNAUTHORIZED'],
    [{ ...valid, approvedRound: 1 }, 'ALREADY_APPROVED'],
  ] as const)('rejects invalid input', (input, error) => {
    expect(evaluateCovenant(input)).toBe(error);
  });
});
