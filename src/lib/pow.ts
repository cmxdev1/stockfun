/**
 * Proof-of-effort for cache claims.
 *
 * The client must find a nonce whose hash has N leading zero bits before the
 * claim server will release a fragment. This is an anti-spam speed bump — it
 * makes scripted mass-claiming cost real CPU — not a security boundary. The
 * actual guards are the server-side claim ledger (one payout per cache, ever),
 * the proximity + velocity check, and per-wallet rate limiting.
 */

/** 32-bit mixing hash. Must stay byte-identical on client and server. */
export function powHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function leadingZeroBits(h: number): number {
  if (h === 0) return 32;
  return Math.clz32(h);
}

export function powChallenge(cacheId: string, playerId: string, epoch: number): string {
  return `${cacheId}|${playerId}|${epoch}`;
}

export function powBits(difficulty: number): number {
  return 8 + difficulty * 2;
}

export function verifyPow(
  cacheId: string,
  playerId: string,
  epoch: number,
  nonce: number,
  difficulty: number,
): boolean {
  const challenge = `${powChallenge(cacheId, playerId, epoch)}|${nonce}`;
  return leadingZeroBits(powHash(challenge)) >= powBits(difficulty);
}

/**
 * Search for a valid nonce. Runs in slices so the render loop keeps 60fps —
 * call repeatedly with the returned cursor until `nonce` is non-null.
 */
export function solvePowSlice(
  cacheId: string,
  playerId: string,
  epoch: number,
  difficulty: number,
  from: number,
  iterations = 20_000,
): { nonce: number | null; next: number } {
  const bits = powBits(difficulty);
  const prefix = powChallenge(cacheId, playerId, epoch);
  for (let n = from; n < from + iterations; n++) {
    if (leadingZeroBits(powHash(`${prefix}|${n}`)) >= bits) {
      return { nonce: n, next: n + 1 };
    }
  }
  return { nonce: null, next: from + iterations };
}
