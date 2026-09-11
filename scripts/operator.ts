const action = process.argv[2];
if (action !== 'advance' && action !== 'reset') {
  throw new Error('Usage: pnpm operator:advance | pnpm operator:reset');
}

const baseUrl = process.env.COVENANT_OPERATOR_URL ?? 'http://127.0.0.1:9923';
const token = process.env.COVENANT_OPERATOR_TOKEN;
const response = await fetch(`${baseUrl}/api/admin/${action}`, {
  method: 'POST',
  headers: token ? { authorization: `Bearer ${token}` } : undefined,
});
const body = await response.json();
if (!response.ok) throw new Error(`Operator action failed (${response.status}): ${JSON.stringify(body)}`);
console.log(JSON.stringify(body, null, 2));
