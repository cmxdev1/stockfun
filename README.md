# STOCKFUN — THE LODE

An infinite, procedurally generated metaverse treasure map with **real tokenised
stock buried in it**. Link a wallet, forge an agent, scan the ground, dig — and
the fragment of a Stock Token lands in your Robinhood Chain wallet the moment
your claim clears.

```
npm install
npm run dev     # http://localhost:3000
```

No configuration is required. Out of the box the game runs in **simulation
mode**: every payout is computed, ledgered and surfaced exactly as it would be
on-chain, but nothing is broadcast and the UI labels it `SIMULATED` throughout.
Add a vault key and token addresses (see `.env.example`) and the same code path
settles for real.

---

## The idea

Touch Grass attaches stock-token fragments to real-world places and makes you
walk there. STOCKFUN does the same thing to a world that does not exist: instead
of a city block, the loot is buried at coordinates in **THE LODE**, an infinite
procedural world you explore from an isometric, Minecraft-adjacent view.

The economics are deliberately identical to the real-world version — every
fragment on the map was **bought and deposited before it spawned**. The world is
generated; the loot is not.

## How a payout happens

Three parts, mirroring the model the genre has settled on:

| Part | Lives in | Job |
| --- | --- | --- |
| **Spawn table** | `src/game/drops.ts` | Decides where caches are and what is in them. Pure function of a **server-secret** spawn seed. |
| **Claim server** | `src/app/api/claim/route.ts` | Re-derives the cache, checks proximity, velocity, the ledger and the excavation proof, then releases. |
| **Vault** | `src/lib/chain.ts` | Holds the Stock Tokens and signs the ERC-20 `transfer()` to the player. |

The important property: **a player can generate the terrain but not the loot.**
`sampleTile(x, y, seed)` is public and deterministic, so the browser renders
byte-identical ground to the server without any map data crossing the wire.
Cache positions come from a different seed that never leaves the server, so the
only way to find a cache is to scan for it.

### What the claim server actually checks

1. **Credentials** — the bearer secret issued when the profile was created.
2. **Re-derivation** — the cache is recomputed from the secret spawn seed. Nothing the client says about what is buried is trusted.
3. **Proximity** — you must be within one tile of the cache.
4. **Velocity** — the position must be reachable from the last position the server accepted. This is the virtual-world analogue of a GPS anti-spoof check.
5. **Rate limit** — a per-player ceiling on claims per minute.
6. **Proof of effort** — a nonce whose hash has *N* leading zero bits, where *N* scales with rarity. This is an anti-spam cost, not a security boundary, and `src/lib/pow.ts` says so.
7. **The ledger** — one payout per cache, permanently. Checked before the vault signs anything.

Only then does the vault transfer. Simulation mode short-circuits at the final
step and returns a clearly-flagged pseudo hash.

## The world

`src/game/world.ts` builds terrain from one seed: continent masks, ridged
mountain spines, moisture and temperature fields, 11 biomes, mineral veins that
raise both cache density and rarity. `src/game/renderer.ts` draws it as
isometric voxels on a plain 2D canvas — no WebGL, no art assets, no runtime
dependencies. Each 16×16 chunk is baked once to an offscreen canvas (columns,
cliff faces, ambient occlusion, props, contour lines) and blitted per frame;
water shimmer, emissive light, cloud shadows, sun shafts, weather and the
day–night grade all run live on top.

Spawn points are not random. `src/game/sites.ts` holds 24 coordinates surveyed
against the live terrain function — dry, walkable, prop-rich, four or more
biomes, real vertical relief — so the first thing a new prospector sees is a
view worth looking at. **Regenerate these if the terrain function changes.**

## Agents

An agent is a small piece of tunable behaviour bound to your wallet, and it is
what you actually load into the world. Four archetypes (`scout`, `digger`,
`oracle`, `drifter`) differ in speed, excavation rate and how they choose
targets; `range` and `greed` continuously trade distance against rarity. Set it
to escort and it shadows you; set it autonomous and it hunts on its own while
you drive the prospector. The logic is in `LodeEngine.pickAgentTarget`.

## Layout

```
src/
  app/
    page.tsx              landing site
    play/page.tsx         the game
    api/
      profile  agent      enrolment and agent tuning
      signals             the scanner — returns blurred signals only
      claim               the claim server
      world  stats  leaderboard
      seed                operator: region manifest + open a new epoch
  game/
    noise.ts              hashing, fbm, ridged, worley
    world.ts              terrain, biomes, walkability
    drops.ts              the spawn table
    sites.ts              surveyed landing sites
    renderer.ts           isometric voxel renderer
    engine.ts             movement, pathfinding, agent AI, mining
  components/
    landing/  game/  ui/
  lib/
    chain.ts              Robinhood Chain + vault payouts
    store.ts              profiles, claim ledger, leaderboard
    pow.ts                proof of effort
    stocks.ts             the loot table
    wallet.ts             EIP-1193 plumbing
```

## Operating the map

`/api/seed` needs `ADMIN_KEY` in an `x-admin-key` header.

```bash
# What does this region need in the vault?
curl -H "x-admin-key: $ADMIN_KEY" \
  "http://localhost:3000/api/seed?x=0&y=0&r=96"

# Deposit a new tranche, then open a new epoch (this re-rolls the whole map
# and invalidates every previous cache id).
curl -X POST -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
  -d '{"depositedUsd": 25000}' http://localhost:3000/api/seed
```

The manifest tells you, per ticker, how many caches exist in the region, how
many shares they total, and what the vault currently holds.

## Storage

`src/lib/store.ts` persists to a JSON file so the whole thing runs with zero
infrastructure. Only three things need to survive: profiles, the claim ledger,
and last-known positions — everything else (terrain, cache positions, loot
contents) is derived on demand. Swap `read`/`write` for Postgres and Redis to
scale it out; nothing else changes.

## Notes before running this for real

- **The vault key can move assets.** Keep it in a secret manager, and give the vault only what the current epoch needs.
- **Prices in `src/lib/stocks.ts` are seed-time reference marks** used for notional scoring. A production deployment should read a Chainlink feed at claim time instead.
- **The bearer secret in `localStorage` identifies a player, not a wallet owner.** It is enough to stop cross-player claim spoofing; add a signed `personal_sign` challenge if you want to prove wallet ownership.
- **Gas.** The vault pays for the transfer out, so a prospector never needs ETH to receive.
- Not investment advice. Fragments are tokenised equity on a public chain and carry the same market risk as the underlying.
