import 'server-only';

import { join } from 'node:path';
import { getCovenantAdapter } from './adapter-runtime';
import { OperationStore } from './operation-store';
import { VerificationService } from './verification-service';

const operationsFile = process.env.COVENANT_OPERATIONS_FILE
  ?? join(process.cwd(), '.covenant-runtime', 'operations.json');
const serviceGlobal = globalThis as typeof globalThis & { __covenantVerificationService?: VerificationService };

export async function getVerificationService() {
  const adapter = await getCovenantAdapter();
  if (!serviceGlobal.__covenantVerificationService) {
    const service = new VerificationService(
      new OperationStore(operationsFile),
      () => adapter.getState(),
      (caseId) => adapter.verify(caseId),
    );
    await service.recoverUnknown();
    serviceGlobal.__covenantVerificationService = service;
  }
  return serviceGlobal.__covenantVerificationService;
}
