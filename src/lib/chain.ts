/**
 * Robinhood Chain wiring.
 *
 * Robinhood Chain is an Arbitrum-stack Ethereum L2 (mainnet chain id 4663,
 * testnet 46630) where Stock Tokens are ordinary ERC-20 contracts and gas is
 * paid in ETH. Paying out a cache is therefore a plain `transfer()` from the
 * vault wallet to the prospector's address.
 *
 * If `VAULT_PRIVATE_KEY` is absent the module runs in SIMULATION mode: every
 * payout returns a deterministic pseudo tx hash and is flagged `simulated` all
 * the way to the UI, so nothing ever pretends to be on-chain when it is not.
 */

import { createPublicClient, createWalletClient, defineChain, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { withAddressesFromEnv, type StockToken } from './stocks';

export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.RHC_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'],
    },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
});

export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.RHC_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com'],
    },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://testnet.robinhoodchain.blockscout.com' },
  },
  testnet: true,
});

export function activeChain() {
  return process.env.RHC_NETWORK === 'testnet' ? robinhoodChainTestnet : robinhoodChain;
}

/** Client-safe chain descriptor for `wallet_addEthereumChain`. */
export const CHAIN_PARAMS = {
  mainnet: {
    chainId: '0x1237', // 4663
    chainName: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
    blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
  },
  testnet: {
    chainId: '0xb626', // 46630
    chainName: 'Robinhood Chain Testnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.testnet.chain.robinhood.com'],
    blockExplorerUrls: ['https://testnet.robinhoodchain.blockscout.com'],
  },
} as const;

const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export function tokenCatalog(): StockToken[] {
  return withAddressesFromEnv(process.env.STOCK_TOKEN_ADDRESSES);
}

export function isLive(): boolean {
  return Boolean(process.env.VAULT_PRIVATE_KEY);
}

export function explorerTxUrl(hash: string): string {
  const base = activeChain().blockExplorers?.default.url ?? '';
  return `${base}/tx/${hash}`;
}

let publicClient: ReturnType<typeof createPublicClient> | null = null;

export function getPublicClient() {
  if (!publicClient) {
    publicClient = createPublicClient({ chain: activeChain(), transport: http() });
  }
  return publicClient;
}

function getVault() {
  const key = process.env.VAULT_PRIVATE_KEY;
  if (!key) return null;
  const account = privateKeyToAccount(key as `0x${string}`);
  const wallet = createWalletClient({ account, chain: activeChain(), transport: http() });
  return { account, wallet };
}

export interface PayoutResult {
  txHash: string;
  simulated: boolean;
  error?: string;
}

/** Deterministic, obviously-fake hash used in simulation mode. */
function simulatedHash(seedParts: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seedParts.length; i++) {
    h1 = Math.imul(h1 ^ seedParts.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + seedParts.charCodeAt(i) * (i + 7), 0x85ebca6b) >>> 0;
  }
  let out = '0x';
  let a = h1;
  let b = h2;
  for (let i = 0; i < 8; i++) {
    a = Math.imul(a ^ (a >>> 13), 0x5bd1e995) >>> 0;
    b = Math.imul(b ^ (b >>> 11), 0x27d4eb2f) >>> 0;
    out += a.toString(16).padStart(8, '0');
    if (out.length >= 66) break;
    out += b.toString(16).padStart(8, '0');
  }
  return out.slice(0, 66);
}

/**
 * Release a stock fragment from the vault to a prospector.
 * Returns immediately after broadcast — the UI shows "pending" until mined.
 */
export async function payoutFragment(
  to: `0x${string}`,
  ticker: string,
  fragment: number,
  idempotencyKey: string,
): Promise<PayoutResult> {
  const token = tokenCatalog().find((t) => t.ticker === ticker.toUpperCase());
  const vault = getVault();

  const isConfigured =
    vault &&
    token &&
    token.address !== '0x0000000000000000000000000000000000000000';

  if (!isConfigured) {
    return { txHash: simulatedHash(`${to}:${ticker}:${fragment}:${idempotencyKey}`), simulated: true };
  }

  try {
    const amount = parseUnits(fragment.toFixed(token.decimals), token.decimals);
    const txHash = await vault.wallet.writeContract({
      address: token.address,
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transfer',
      args: [to, amount],
      chain: activeChain(),
      account: vault.account,
    });
    return { txHash, simulated: false };
  } catch (err) {
    return {
      txHash: '',
      simulated: false,
      error: err instanceof Error ? err.message : 'vault transfer failed',
    };
  }
}

/** Remaining vault balance for a ticker, in whole share units. */
export async function vaultBalance(ticker: string): Promise<number | null> {
  const token = tokenCatalog().find((t) => t.ticker === ticker.toUpperCase());
  const vault = getVault();
  if (!vault || !token || token.address === '0x0000000000000000000000000000000000000000') {
    return null;
  }
  try {
    const raw = await getPublicClient().readContract({
      address: token.address,
      abi: ERC20_TRANSFER_ABI,
      functionName: 'balanceOf',
      args: [vault.account.address],
    });
    return Number(raw) / 10 ** token.decimals;
  } catch {
    return null;
  }
}

export function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
