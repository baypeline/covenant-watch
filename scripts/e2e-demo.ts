import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const port = Number(process.env.COVENANT_E2E_PORT ?? 19876);
const baseUrl = `http://127.0.0.1:${port}`;
const runtimeDirectory = mkdtempSync(join(tmpdir(), 'covenant-e2e-'));
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    COVENANT_ADAPTER: 'demo',
    NEXT_PUBLIC_APP_MODE: 'demo',
    COVENANT_OPERATIONS_FILE: join(runtimeDirectory, 'operations.json'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

try {
  await waitUntilReady();
  const initial = await api('/api/admin/reset', { method: 'POST' });
  assert(initial.status === 200 && initial.body.state.currentRound === 1, 'demo reset failed');

  const malformed = await api('/api/verify', {
    method: 'POST',
    body: JSON.stringify({ caseId: 'unknown', requestId: 'e2e-bad-request', expectedRound: 1 }),
  });
  assert(malformed.status === 400 && malformed.body.code === 'BAD_REQUEST', 'BAD_REQUEST mapping failed');

  const staleState = await api('/api/verify', {
    method: 'POST',
    body: JSON.stringify({ caseId: 'round-1-pass', requestId: 'e2e-state-changed', expectedRound: 2 }),
  });
  assert(staleState.status === 409 && staleState.body.code === 'STATE_CHANGED', 'STATE_CHANGED mapping failed');

  const roundOne = await startAndWait('round-1-pass', 'e2e-round-one', 1);
  assert(roundOne.phase === 'confirmed', 'round one was not confirmed');
  assert(typeof roundOne.transactionId === 'string', 'confirmed operation has no transaction ID');
  assert(roundOne.state.approvedRound === 1, 'round one approval was not reflected');

  const idempotentRetry = await api('/api/verify', {
    method: 'POST',
    body: JSON.stringify({ caseId: 'round-1-pass', requestId: 'e2e-round-one', expectedRound: 1 }),
  });
  assert(idempotentRetry.body.operationId === roundOne.operationId, 'idempotent retry created another operation');

  const advanced = await api('/api/admin/advance', { method: 'POST' });
  assert(advanced.body.state.currentRound === 2 && advanced.body.state.approvedRound === 1, 'round advance failed');

  const insufficient = await startAndWait('round-2-fail', 'e2e-insufficient', 2);
  assert(insufficient.phase === 'rejected' && insufficient.code === 'INSUFFICIENT_CASH', 'cash rejection failed');
  assert(insufficient.transactionId === null, 'rejected cash request exposed a transaction ID');

  const stale = await startAndWait('round-1-stale', 'e2e-stale', 2);
  assert(stale.phase === 'rejected' && stale.code === 'STALE_DATA', 'stale rejection failed');
  assert(stale.transactionId === null, 'stale request exposed a transaction ID');

  const missing = await api('/api/verify/not-found');
  assert(missing.status === 404 && missing.body.code === 'OPERATION_NOT_FOUND', '404 mapping failed');

  const receipt = {
    ok: true,
    roundOne: { operationId: roundOne.operationId, transactionId: roundOne.transactionId },
    roundTwo: { currentRound: advanced.body.state.currentRound, approvedRound: advanced.body.state.approvedRound },
    insufficientCash: { code: insufficient.code, transactionId: insufficient.transactionId },
    staleSnapshot: { code: stale.code, transactionId: stale.transactionId },
  };
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  rmSync(runtimeDirectory, { recursive: true, force: true });
}

async function startAndWait(caseId: string, requestId: string, expectedRound: number) {
  const accepted = await api('/api/verify', {
    method: 'POST',
    body: JSON.stringify({ caseId, requestId, expectedRound }),
  });
  assert(accepted.status === 202, `verification was not accepted: ${JSON.stringify(accepted.body)}`);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const operation = await api(`/api/verify/${accepted.body.operationId}`);
    if (['confirmed', 'rejected', 'unknown'].includes(operation.body.phase)) return operation.body;
    await delay(50);
  }
  throw new Error(`operation ${accepted.body.operationId} did not finish`);
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next server exited early:\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/state`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Next server did not become ready:\n${serverOutput}`);
}

async function api(pathname: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  return { status: response.status, body: await response.json() as any };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
