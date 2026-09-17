'use client';

/**
 * Minimal EIP-1193 wallet plumbing.
 *
 * Deliberately dependency-free: we only ever need the account list and a chain
 * switch. Players without an injected wallet can still play by pasting an
 * address — payouts go to whatever address is linked, so a watch-only address
 * receives fragments exactly the same way.
 */

import { CHAIN_PARAMS } from './chain';

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  }
}

export function hasInjectedWallet(): boolean {
  return typeof window !== 'undefined' && Boolean(window.ethereum);
}

function provider(): Eip1193Provider {
  const eth = typeof window !== 'undefined' ? window.ethereum : undefined;
  if (!eth) throw new Error('No browser wallet detected.');
  // Some extensions stack multiple providers; prefer the first that responds.
  return eth.providers?.[0] ?? eth;
}

export function targetChain() {
  return process.env.NEXT_PUBLIC_RHC_NETWORK === 'testnet'
    ? CHAIN_PARAMS.testnet
    : CHAIN_PARAMS.mainnet;
}

export async function connectWallet(): Promise<string> {
  const eth = provider();
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts?.length) throw new Error('Wallet returned no accounts.');
  return accounts[0];
}

export async function currentAccount(): Promise<string | null> {
  if (!hasInjectedWallet()) return null;
  try {
    const accounts = (await provider().request({ method: 'eth_accounts' })) as string[];
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function currentChainId(): Promise<string | null> {
  if (!hasInjectedWallet()) return null;
  try {
    return (await provider().request({ method: 'eth_chainId' })) as string;
  } catch {
    return null;
  }
}

/** Switch to Robinhood Chain, adding the network if the wallet has not seen it. */
export async function ensureRobinhoodChain(): Promise<{ ok: boolean; error?: string }> {
  const chain = targetChain();
  const eth = provider();
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chain.chainId }],
    });
    return { ok: true };
  } catch (err) {
    const code = (err as { code?: number })?.code;
    // 4902: unrecognised chain. Offer to add it.
    if (code === 4902 || code === -32603) {
      try {
        await eth.request({ method: 'wallet_addEthereumChain', params: [chain] });
        return { ok: true };
      } catch (addErr) {
        return {
          ok: false,
          error: addErr instanceof Error ? addErr.message : 'Could not add Robinhood Chain.',
        };
      }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not switch network.',
    };
  }
}

export function onAccountsChanged(handler: (accounts: string[]) => void): () => void {
  if (!hasInjectedWallet()) return () => {};
  const eth = provider();
  const wrapped = (...args: never[]) => handler(args[0] as unknown as string[]);
  eth.on?.('accountsChanged', wrapped);
  return () => eth.removeListener?.('accountsChanged', wrapped);
}

export function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

export function isAddressLike(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}
