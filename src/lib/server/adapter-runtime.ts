import 'server-only';

import type { CovenantAdapter } from './covenant-adapter';
import { advanceDemoSnapshot, readLedger, resetDemoLedger, verifyDemoCase } from './demo-ledger';

const runtimeGlobal = globalThis as typeof globalThis & { __covenantAdapter?: Promise<CovenantAdapter> };

export function getCovenantAdapter(): Promise<CovenantAdapter> {
  runtimeGlobal.__covenantAdapter ??= createAdapter();
  return runtimeGlobal.__covenantAdapter;
}

async function createAdapter(): Promise<CovenantAdapter> {
  const mode = process.env.COVENANT_ADAPTER ?? process.env.NEXT_PUBLIC_APP_MODE ?? 'demo';
  if (mode === 'demo') {
    return {
      mode: 'demo',
      getState: async () => readLedger(),
      verify: async (caseId, lifecycle) => {
        const result = verifyDemoCase(caseId);
        if (result.ok) {
          lifecycle?.onSubmitting();
          lifecycle?.onSubmitted(result.transactionId);
        }
        return result;
      },
      advance: async () => advanceDemoSnapshot(),
      reset: async () => resetDemoLedger(),
    };
  }
  if (mode === 'midnight') {
    const { createMidnightAdapter } = await import('./midnight-adapter');
    return createMidnightAdapter();
  }
  throw new Error(`Unsupported COVENANT_ADAPTER mode: ${mode}`);
}
