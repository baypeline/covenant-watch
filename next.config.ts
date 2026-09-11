import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  output: 'standalone',
  serverExternalPackages: [
    '@midnight-ntwrk/compact-js',
    '@midnight-ntwrk/compact-runtime',
    '@midnight-ntwrk/midnight-js-contracts',
    '@midnight-ntwrk/midnight-js-http-client-proof-provider',
    '@midnight-ntwrk/midnight-js-indexer-public-data-provider',
    '@midnight-ntwrk/midnight-js-level-private-state-provider',
    '@midnight-ntwrk/midnight-js-network-id',
    '@midnight-ntwrk/midnight-js-node-zk-config-provider',
    '@midnight-ntwrk/midnight-js-protocol',
    '@midnight-ntwrk/midnight-js-types',
    '@midnight-ntwrk/midnight-js-utils',
    '@midnight-ntwrk/testkit-js',
    '@midnight-ntwrk/wallet-sdk',
    'classic-level',
  ],
  compiler: {
    emotion: true,
  },
};

export default nextConfig;
