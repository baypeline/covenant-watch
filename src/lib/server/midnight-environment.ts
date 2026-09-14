import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';

export const midnightNetworkIds = ['undeployed', 'preview', 'preprod', 'mainnet'] as const;
export type MidnightNetworkId = (typeof midnightNetworkIds)[number];
type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

type EndpointSet = Pick<
  EnvironmentConfiguration,
  'indexer' | 'indexerWS' | 'node' | 'nodeWS' | 'proofServer'
>;

const defaults: Record<MidnightNetworkId, EndpointSet> = {
  undeployed: {
    indexer: 'http://127.0.0.1:18088/api/v4/graphql',
    indexerWS: 'ws://127.0.0.1:18088/api/v4/graphql/ws',
    node: 'http://127.0.0.1:19944',
    nodeWS: 'ws://127.0.0.1:19944',
    proofServer: 'http://127.0.0.1:16300',
  },
  preview: publicEndpoints('preview'),
  preprod: publicEndpoints('preprod'),
  mainnet: publicEndpoints('mainnet'),
};

export function getMidnightEnvironment(
  environment: EnvironmentVariables = process.env,
): EnvironmentConfiguration {
  const networkId = parseNetworkId(environment.MIDNIGHT_NETWORK_ID);
  const fallback = defaults[networkId];
  const result: EnvironmentConfiguration = {
    walletNetworkId: networkId,
    networkId,
    indexer: environment.MIDNIGHT_INDEXER_URL ?? fallback.indexer,
    indexerWS: environment.MIDNIGHT_INDEXER_WS_URL ?? fallback.indexerWS,
    node: environment.MIDNIGHT_NODE_URL ?? fallback.node,
    nodeWS: environment.MIDNIGHT_NODE_WS_URL ?? fallback.nodeWS,
    proofServer: environment.MIDNIGHT_PROOF_SERVER_URL ?? fallback.proofServer,
    faucet: '',
  };

  assertUrl('MIDNIGHT_INDEXER_URL', result.indexer, ['http:', 'https:']);
  assertUrl('MIDNIGHT_INDEXER_WS_URL', result.indexerWS, ['ws:', 'wss:']);
  assertUrl('MIDNIGHT_NODE_URL', result.node, ['http:', 'https:']);
  assertUrl('MIDNIGHT_NODE_WS_URL', result.nodeWS, ['ws:', 'wss:']);
  assertUrl('MIDNIGHT_PROOF_SERVER_URL', result.proofServer, ['http:', 'https:']);

  if (networkId !== 'undeployed') {
    assertOfficialEndpointNetwork('MIDNIGHT_INDEXER_URL', result.indexer, networkId);
    assertOfficialEndpointNetwork('MIDNIGHT_INDEXER_WS_URL', result.indexerWS, networkId);
    assertOfficialEndpointNetwork('MIDNIGHT_NODE_URL', result.node, networkId);
    assertOfficialEndpointNetwork('MIDNIGHT_NODE_WS_URL', result.nodeWS, networkId);
  }

  return result;
}

function publicEndpoints(networkId: Exclude<MidnightNetworkId, 'undeployed'>): EndpointSet {
  return {
    indexer: `https://indexer.${networkId}.midnight.network/api/v4/graphql`,
    indexerWS: `wss://indexer.${networkId}.midnight.network/api/v4/graphql/ws`,
    node: `https://rpc.${networkId}.midnight.network`,
    nodeWS: `wss://rpc.${networkId}.midnight.network`,
    proofServer: 'http://127.0.0.1:6300',
  };
}

function parseNetworkId(value: string | undefined): MidnightNetworkId {
  const networkId = value ?? 'undeployed';
  if (!midnightNetworkIds.includes(networkId as MidnightNetworkId)) {
    throw new Error(
      `Unsupported MIDNIGHT_NETWORK_ID: ${networkId}. Expected one of ${midnightNetworkIds.join(', ')}.`,
    );
  }
  return networkId as MidnightNetworkId;
}

function assertUrl(name: string, value: string, protocols: string[]) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (!protocols.includes(url.protocol)) {
    throw new Error(`${name} must use ${protocols.join(' or ')}`);
  }
}

function assertOfficialEndpointNetwork(
  name: string,
  value: string,
  networkId: Exclude<MidnightNetworkId, 'undeployed'>,
) {
  const hostname = new URL(value).hostname;
  const match = /^(?:rpc|indexer)\.(preview|preprod|mainnet)\.midnight\.network$/.exec(hostname);
  if (match && match[1] !== networkId) {
    throw new Error(`${name} targets ${match[1]} but MIDNIGHT_NETWORK_ID is ${networkId}.`);
  }
}
