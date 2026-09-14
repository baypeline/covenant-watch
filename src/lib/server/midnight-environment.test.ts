import { describe, expect, it } from 'vitest';
import { getMidnightEnvironment } from './midnight-environment';

describe('Midnight environment', () => {
  it('uses the official Preprod endpoints by default', () => {
    expect(getMidnightEnvironment({ MIDNIGHT_NETWORK_ID: 'preprod' })).toMatchObject({
      walletNetworkId: 'preprod',
      networkId: 'preprod',
      indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
      indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
      node: 'https://rpc.preprod.midnight.network',
      nodeWS: 'wss://rpc.preprod.midnight.network',
      proofServer: 'http://127.0.0.1:6300',
    });
  });

  it('keeps the local development defaults for undeployed', () => {
    expect(getMidnightEnvironment({})).toMatchObject({
      networkId: 'undeployed',
      indexer: 'http://127.0.0.1:18088/api/v4/graphql',
      node: 'http://127.0.0.1:19944',
      proofServer: 'http://127.0.0.1:16300',
    });
  });

  it('accepts a private proof server override', () => {
    expect(getMidnightEnvironment({
      MIDNIGHT_NETWORK_ID: 'preprod',
      MIDNIGHT_PROOF_SERVER_URL: 'http://proof-server:6300',
    }).proofServer).toBe('http://proof-server:6300');
  });

  it('rejects endpoints belonging to another public network', () => {
    expect(() => getMidnightEnvironment({
      MIDNIGHT_NETWORK_ID: 'preprod',
      MIDNIGHT_NODE_URL: 'https://rpc.preview.midnight.network',
    })).toThrow('MIDNIGHT_NODE_URL targets preview but MIDNIGHT_NETWORK_ID is preprod.');
  });

  it('rejects unsupported network identifiers and URL protocols', () => {
    expect(() => getMidnightEnvironment({ MIDNIGHT_NETWORK_ID: 'testnet-02' })).toThrow(
      'Unsupported MIDNIGHT_NETWORK_ID',
    );
    expect(() => getMidnightEnvironment({
      MIDNIGHT_NETWORK_ID: 'preprod',
      MIDNIGHT_NODE_URL: 'ftp://rpc.preprod.midnight.network',
    })).toThrow('MIDNIGHT_NODE_URL must use http: or https:');
  });
});
