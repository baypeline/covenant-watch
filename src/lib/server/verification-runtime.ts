import 'server-only';

import { join } from 'node:path';
import { readLedger, verifyDemoCase } from './demo-ledger';
import { OperationStore } from './operation-store';
import { VerificationService } from './verification-service';

const operationsFile = process.env.COVENANT_OPERATIONS_FILE
  ?? join(process.cwd(), '.covenant-runtime', 'operations.json');
const serviceGlobal = globalThis as typeof globalThis & { __covenantVerificationService?: VerificationService };

export function getVerificationService() {
  serviceGlobal.__covenantVerificationService ??= new VerificationService(
    new OperationStore(operationsFile),
    readLedger,
    async (caseId) => verifyDemoCase(caseId),
  );
  return serviceGlobal.__covenantVerificationService;
}
