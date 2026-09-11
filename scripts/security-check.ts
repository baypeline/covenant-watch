import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const forbiddenFiles = trackedFiles.filter((file) =>
  file === '.env'
  || file.startsWith('.covenant-runtime/')
  || /(^|\/)(id_[a-z0-9]+|[^/]+\.(pem|p12|pfx))$/i.test(file));

const signatures = [
  ['private key block', ['-----BEGIN ', 'PRIVATE KEY-----'].join('')],
  ['AWS access key', ['AKIA', '[A-Z0-9]{16}'].join('')],
  ['GitHub token', ['gh', 'p_[A-Za-z0-9]{30,}'].join('')],
] as const;
const findings: string[] = forbiddenFiles.map((file) => `forbidden tracked file: ${file}`);

for (const file of trackedFiles) {
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const [name, pattern] of signatures) {
    if (new RegExp(pattern).test(content)) findings.push(`${name}: ${file}`);
  }
  for (const variable of ['MIDNIGHT_WALLET_SEED', 'MIDNIGHT_PRIVATE_STATE_PASSWORD']) {
    const assignment = new RegExp(`^${variable}=(.+)$`, 'm').exec(content);
    if (assignment?.[1].trim()) findings.push(`hard-coded ${variable}: ${file}`);
  }
}

execFileSync('git', ['check-ignore', '--quiet', '.covenant-runtime/midnight-runtime.json']);
if (findings.length > 0) {
  throw new Error(`Secret scan failed:\n${findings.join('\n')}`);
}
console.log(JSON.stringify({ ok: true, trackedFilesScanned: trackedFiles.length, runtimeSecretsIgnored: true }, null, 2));
