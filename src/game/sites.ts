/**
 * Landing sites.
 *
 * THE LODE is infinite, but a first impression is not. These 24 coordinates
 * were surveyed against the live terrain function and kept only if they sit on
 * dry, walkable, prop-rich ground with at least four biomes and real vertical
 * relief inside a 52-tile window — so wherever a prospector drops in, the first
 * thing they see is a view worth screenshotting.
 *
 * Regenerate these if the terrain function ever changes.
 */

import { nearestWalkable, WORLD } from './world';
import { seedFromString, mulberry32 } from './noise';

export const LANDING_SITES: Array<readonly [number, number]> = [
  [1120, 800],
  [-960, 3360],
  [-1920, -3040],
  [-640, -960],
  [-2560, 3040],
  [-320, 2720],
  [-2560, 480],
  [1440, -800],
  [1600, 3840],
  [3200, 2720],
  [2720, 640],
  [1600, -2560],
  [-3520, -2880],
  [640, -3040],
  [-3840, -4000],
  [3200, 3680],
  [4000, 2880],
  [1600, 2560],
  [4000, -2880],
  [3840, -3840],
  [-640, 1600],
  [1120, -3680],
  [-320, -3360],
  [3840, -160],
];

/**
 * Deterministic spawn for a wallet: the same address always lands in the same
 * place, jittered inside its site so two prospectors never stack exactly.
 */
export function spawnForWallet(
  wallet: string,
  seed: number = WORLD.seed,
): { x: number; y: number } {
  const rng = mulberry32(seedFromString(wallet.toLowerCase()));
  const site = LANDING_SITES[Math.floor(rng() * LANDING_SITES.length)];
  const jx = Math.round((rng() - 0.5) * 30);
  const jy = Math.round((rng() - 0.5) * 30);
  return nearestWalkable(site[0] + jx, site[1] + jy, seed, 64, true);
}

/** A site picked for a decorative backdrop, by index rather than by wallet. */
export function siteAt(index: number): { x: number; y: number } {
  const site = LANDING_SITES[((index % LANDING_SITES.length) + LANDING_SITES.length) % LANDING_SITES.length];
  return { x: site[0], y: site[1] };
}
