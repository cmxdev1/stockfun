/**
 * The loot table: tokenised Stock Tokens that can be buried in THE LODE.
 *
 * Stock Tokens on Robinhood Chain are ordinary ERC-20 contracts, so a cache is
 * just a pending `transfer()` of a very small balance. `refPrice` is a seed-time
 * reference mark used for notional scoring and leaderboard maths only — in a
 * production deployment this is read from a Chainlink price feed at claim time,
 * not from this file.
 */

export type Sector =
  | 'Semiconductors'
  | 'Big Tech'
  | 'Consumer'
  | 'Energy'
  | 'Finance'
  | 'Crypto-adjacent'
  | 'Healthcare'
  | 'Industrials'
  | 'Index';

export interface StockToken {
  ticker: string;
  name: string;
  sector: Sector;
  /** Brand-ish accent used for the cache aura and inventory chips. */
  color: string;
  /** Reference price in USD used for notional scoring. */
  refPrice: number;
  /** ERC-20 decimals for the Stock Token contract. */
  decimals: number;
  /** On-chain address, injected per-deployment via env. Zero address = demo. */
  address: `0x${string}`;
}

const ZERO = '0x0000000000000000000000000000000000000000' as const;

export const STOCKS: StockToken[] = [
  { ticker: 'NVDA', name: 'NVIDIA', sector: 'Semiconductors', color: '#76d13c', refPrice: 178.4, decimals: 18, address: ZERO },
  { ticker: 'AAPL', name: 'Apple', sector: 'Big Tech', color: '#e8e8ed', refPrice: 262.1, decimals: 18, address: ZERO },
  { ticker: 'MSFT', name: 'Microsoft', sector: 'Big Tech', color: '#5bc0f8', refPrice: 512.7, decimals: 18, address: ZERO },
  { ticker: 'GOOGL', name: 'Alphabet', sector: 'Big Tech', color: '#ffcf4d', refPrice: 254.9, decimals: 18, address: ZERO },
  { ticker: 'AMZN', name: 'Amazon', sector: 'Consumer', color: '#ff9c2b', refPrice: 231.6, decimals: 18, address: ZERO },
  { ticker: 'META', name: 'Meta Platforms', sector: 'Big Tech', color: '#4f8dff', refPrice: 618.3, decimals: 18, address: ZERO },
  { ticker: 'TSLA', name: 'Tesla', sector: 'Consumer', color: '#ff4d4d', refPrice: 421.8, decimals: 18, address: ZERO },
  { ticker: 'AMD', name: 'Advanced Micro Devices', sector: 'Semiconductors', color: '#ff6b45', refPrice: 214.5, decimals: 18, address: ZERO },
  { ticker: 'AVGO', name: 'Broadcom', sector: 'Semiconductors', color: '#d85cff', refPrice: 366.2, decimals: 18, address: ZERO },
  { ticker: 'HOOD', name: 'Robinhood Markets', sector: 'Finance', color: '#6dff9e', refPrice: 118.9, decimals: 18, address: ZERO },
  { ticker: 'COIN', name: 'Coinbase', sector: 'Crypto-adjacent', color: '#3f6bff', refPrice: 342.7, decimals: 18, address: ZERO },
  { ticker: 'MSTR', name: 'Strategy', sector: 'Crypto-adjacent', color: '#ffa53f', refPrice: 289.4, decimals: 18, address: ZERO },
  { ticker: 'PLTR', name: 'Palantir', sector: 'Industrials', color: '#9aa7ff', refPrice: 176.2, decimals: 18, address: ZERO },
  { ticker: 'NFLX', name: 'Netflix', sector: 'Consumer', color: '#ff3b3b', refPrice: 924.5, decimals: 18, address: ZERO },
  { ticker: 'LLY', name: 'Eli Lilly', sector: 'Healthcare', color: '#ff7fbf', refPrice: 812.3, decimals: 18, address: ZERO },
  { ticker: 'XOM', name: 'Exxon Mobil', sector: 'Energy', color: '#ffd04d', refPrice: 121.7, decimals: 18, address: ZERO },
  { ticker: 'SPY', name: 'S&P 500 Trust', sector: 'Index', color: '#c9d4ff', refPrice: 682.4, decimals: 18, address: ZERO },
  { ticker: 'QQQ', name: 'Nasdaq-100 Trust', sector: 'Index', color: '#7ce3ff', refPrice: 598.1, decimals: 18, address: ZERO },
];

const BY_TICKER = new Map(STOCKS.map((s) => [s.ticker, s]));

export function stockByTicker(ticker: string): StockToken | undefined {
  return BY_TICKER.get(ticker.toUpperCase());
}

export function sectorOf(ticker: string): Sector {
  return stockByTicker(ticker)?.sector ?? 'Index';
}

export function colorOf(ticker: string): string {
  return stockByTicker(ticker)?.color ?? '#9aa7ff';
}

/**
 * Resolve on-chain addresses from the environment.
 * Format: `NVDA:0xabc...,AAPL:0xdef...`
 */
export function withAddressesFromEnv(raw: string | undefined): StockToken[] {
  if (!raw) return STOCKS;
  const map = new Map<string, `0x${string}`>();
  for (const pair of raw.split(',')) {
    const [ticker, address] = pair.split(':').map((p) => p?.trim());
    if (ticker && address?.startsWith('0x')) {
      map.set(ticker.toUpperCase(), address as `0x${string}`);
    }
  }
  return STOCKS.map((s) => ({ ...s, address: map.get(s.ticker) ?? s.address }));
}

/** Format a fragment as a share count with sensible precision. */
export function formatFragment(fragment: number): string {
  if (fragment >= 1) return fragment.toFixed(3);
  if (fragment >= 0.01) return fragment.toFixed(5);
  return fragment.toFixed(7);
}

export function formatUsd(value: number): string {
  if (value >= 1000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
}
