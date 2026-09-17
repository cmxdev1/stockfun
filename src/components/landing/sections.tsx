import { BIOMES, BIOME_ORDER } from '@/game/world';
import { notionalRange, RARITIES, RARITY_ORDER } from '@/game/drops';
import { STOCKS, formatUsd } from '@/lib/stocks';
import { WorldBackdrop } from '@/components/WorldBackdrop';
import {
  Chip,
  Divider,
  GlowCard,
  GridBackdrop,
  LinkButton,
  Section,
  SectionHeading,
} from '@/components/ui/primitives';
import { LodeMark, Wordmark } from '@/components/ui/Logo';

/* ------------------------------------------------------------------ *
 * How it works
 * ------------------------------------------------------------------ */

const STEPS = [
  {
    n: '01',
    title: 'Link a wallet',
    glow: 'rgba(109,255,168,0.18)',
    body: 'Connect any EVM wallet on Robinhood Chain, or paste an address to watch. That address is your prospector — everything you dig up is transferred to it directly. We never take custody of what you find.',
    detail: 'Chain ID 4663 · gas in ETH · Stock Tokens are plain ERC-20s',
  },
  {
    n: '02',
    title: 'Forge an agent',
    glow: 'rgba(65,245,255,0.18)',
    body: 'Your agent is the character you actually load into the world. Pick an archetype, tune its range and its greed, and decide whether it walks beside you or hunts on its own while you steer.',
    detail: 'Four archetypes · tuneable range, greed and autonomy',
  },
  {
    n: '03',
    title: 'Scan the ground',
    glow: 'rgba(160,107,255,0.18)',
    body: 'Caches sit at coordinates you cannot see. Fire a resonance sweep and the server answers with blurred signals — rarity and market sector only. Never the ticker. Never the size. You find that out by digging.',
    detail: '26-tile sweep radius · 6.5s cooldown',
  },
  {
    n: '04',
    title: 'Dig. Get paid.',
    glow: 'rgba(255,196,77,0.2)',
    body: 'Stand on the cache and break ground. The moment the excavation proof clears, the vault signs a transfer and the fragment of real tokenised stock lands in your wallet. No claim queue, no weekly batch.',
    detail: 'Instant ERC-20 transfer · one payout per cache, ever',
  },
];

export function HowItWorks() {
  return (
    <Section id="how" className="border-t border-hairline">
      <GridBackdrop />
      <div className="relative">
        <SectionHeading
          eyebrow="The loop"
          title={
            <>
              Four moves between you
              <br className="hidden sm:block" /> and <span className="gold-text">owning a sliver of NVIDIA</span>
            </>
          }
          blurb="Every fragment on the map was bought and deposited before it spawned. The world is generated; the loot is not."
        />

        <ol className="mt-16 grid gap-5 lg:grid-cols-2">
          {STEPS.map((s) => (
            <GlowCard as="li" key={s.n} glow={s.glow} className="p-7 sm:p-9">
              <div className="flex items-start gap-5">
                <span
                  className="display shrink-0 text-5xl leading-none text-transparent sm:text-6xl"
                  style={{ WebkitTextStroke: '1px #2a3a6e' }}
                >
                  {s.n}
                </span>
                <div>
                  <h3 className="display text-xl sm:text-2xl">{s.title}</h3>
                  <p className="mt-3 text-pretty text-[15px] leading-relaxed text-ink-dim">{s.body}</p>
                  <p className="mono mt-4 text-[11px] uppercase tracking-[0.14em] text-ink-mute">
                    {s.detail}
                  </p>
                </div>
              </div>
            </GlowCard>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Loot
 * ------------------------------------------------------------------ */

const RARITY_COPY: Record<string, string> = {
  common: 'Surface litter. One strike and it is yours.',
  rare: 'Buried a layer down. Worth the detour.',
  epic: 'Sits in mineral veins. Bring an agent that digs.',
  legendary: 'Dunes and peaks only. The map lights up for these.',
  mythic: 'Ember Wastes. A handful exist per epoch.',
};

export function Loot() {
  return (
    <Section id="loot" className="border-t border-hairline bg-[#05070f]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(55% 40% at 50% 0%, rgba(255,196,77,0.08), transparent 70%)',
        }}
      />
      <div className="relative">
        <SectionHeading
          eyebrow="The loot table"
          title={
            <>
              Five tiers of cache.
              <br className="hidden sm:block" /> <span className="aurora-text">All of it real equity.</span>
            </>
          }
          blurb="Rarity decides how much notional is inside and how hard the ground fights back. Rich mineral veins bend the curve — dig where the map glints."
        />

        <div className="mt-16 overflow-hidden rounded-[var(--radius-xl2)] border border-hairline">
          <div className="hidden grid-cols-[1.1fr_0.7fr_0.7fr_1.6fr] gap-4 bg-white/[0.02] px-6 py-4 lg:grid">
            {['Tier', 'Notional', 'Strikes', 'Where it hides'].map((h) => (
              <div key={h} className="eyebrow text-[10px]">
                {h}
              </div>
            ))}
          </div>
          {RARITY_ORDER.map((id) => {
            const r = RARITIES[id];
            const { low, high } = notionalRange(id);
            return (
              <div
                key={id}
                className="group grid grid-cols-1 gap-3 border-t border-hairline px-6 py-5 transition-colors hover:bg-white/[0.025] lg:grid-cols-[1.1fr_0.7fr_0.7fr_1.6fr] lg:items-center lg:gap-4"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-8 w-1 rounded-full transition-all duration-300 group-hover:h-10"
                    style={{ background: r.color, boxShadow: `0 0 18px ${r.glow}` }}
                  />
                  <span className="display text-lg" style={{ color: r.color }}>
                    {r.label}
                  </span>
                </div>
                <div className="mono text-sm text-ink">
                  {formatUsd(low)}<span className="text-ink-mute"> – </span>{formatUsd(high)}
                </div>
                <div className="mono flex gap-1 text-sm text-ink-dim">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-4 rounded-full"
                      style={{
                        background: i < r.difficulty ? r.color : '#1b2444',
                        opacity: i < r.difficulty ? 1 : 1,
                      }}
                    />
                  ))}
                </div>
                <div className="text-sm text-ink-dim">{RARITY_COPY[id]}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-14">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="display text-xl">In the ground right now</h3>
            <span className="mono text-[11px] text-ink-mute">
              {STOCKS.length} Stock Tokens seeded · more each epoch
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {STOCKS.map((s) => (
              <li
                key={s.ticker}
                className="glass group relative overflow-hidden rounded-2xl p-4 transition-transform duration-300 hover:-translate-y-1"
              >
                <div
                  className="absolute inset-x-0 top-0 h-px opacity-60"
                  style={{ background: `linear-gradient(90deg, transparent, ${s.color}, transparent)` }}
                />
                <div className="mono text-sm font-bold" style={{ color: s.color }}>
                  ${s.ticker}
                </div>
                <div className="mt-1 truncate text-[12px] text-ink-dim">{s.name}</div>
                <div className="mono mt-3 text-[10px] uppercase tracking-[0.12em] text-ink-mute">
                  {s.sector}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Agents
 * ------------------------------------------------------------------ */

const ARCHETYPES = [
  {
    id: 'scout',
    name: 'Scout',
    hue: 190,
    tagline: 'Fast, wide, restless.',
    body: 'Moves 25% quicker and ranges furthest from you. Best when you want the map opened up and every signal in a sector tagged before you commit.',
    perk: '1.25× speed · 1.5× leash',
  },
  {
    id: 'digger',
    name: 'Digger',
    hue: 38,
    tagline: 'Built for the hard ground.',
    body: 'Excavates 45% faster, so epics and legendaries that would stall a scout come out clean. Slower across open terrain and on a shorter leash — you trade tempo for depth.',
    perk: '1.45× excavation rate',
  },
  {
    id: 'oracle',
    name: 'Oracle',
    hue: 272,
    tagline: 'Reads the substrate.',
    body: 'Adds a standing rarity bias on top of whatever greed you dial in. Pair it with a high setting and it will walk past a dozen commons to sit on one legendary signal.',
    perk: '+0.35 standing rarity bias',
  },
  {
    id: 'drifter',
    name: 'Drifter',
    hue: 150,
    tagline: 'Never stops wandering.',
    body: 'When the board is empty it ranges almost twice as wide as anything else, hunting the richest mineral veins and quietly charting new chunks while you handle the caches you already found.',
    perk: '1.9× idle wander radius',
  },
];

export function Agents() {
  return (
    <Section id="agents" className="border-t border-hairline">
      <GridBackdrop />
      <div className="relative">
        <SectionHeading
          eyebrow="Forge an agent"
          title={
            <>
              You do not play alone.
              <br className="hidden sm:block" /> You play <span className="aurora-text">through something</span>.
            </>
          }
          blurb="An agent is a small, tunable piece of behaviour bound to your wallet. Set it to escort and it shadows you. Set it autonomous and it hunts on its own while you drive the prospector."
        />

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ARCHETYPES.map((a) => (
            <GlowCard
              key={a.id}
              glow={`hsla(${a.hue}, 95%, 60%, 0.2)`}
              className="flex flex-col p-7"
            >
              <div
                className="relative mb-6 grid h-16 w-16 place-items-center rounded-2xl"
                style={{
                  background: `radial-gradient(circle at 35% 25%, hsla(${a.hue},95%,70%,0.35), transparent 70%)`,
                  border: `1px solid hsla(${a.hue},80%,60%,0.35)`,
                }}
              >
                <span
                  className="block h-6 w-6 rotate-45 rounded-[4px]"
                  style={{
                    background: `linear-gradient(135deg, hsl(${a.hue},95%,72%), hsl(${a.hue},80%,45%))`,
                    boxShadow: `0 0 26px hsla(${a.hue},95%,60%,0.6)`,
                  }}
                />
              </div>
              <h3 className="display text-xl">{a.name}</h3>
              <p
                className="mono mt-1 text-[11px] uppercase tracking-[0.14em]"
                style={{ color: `hsl(${a.hue}, 90%, 68%)` }}
              >
                {a.tagline}
              </p>
              <p className="mt-4 flex-1 text-[14px] leading-relaxed text-ink-dim">{a.body}</p>
              <div className="mono mt-6 rounded-xl border border-hairline bg-white/[0.02] px-3 py-2 text-[11px] text-ink-dim">
                {a.perk}
              </div>
            </GlowCard>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * The world
 * ------------------------------------------------------------------ */

export function World() {
  return (
    <Section id="world" className="border-t border-hairline bg-[#05070f]">
      <div className="relative">
        <SectionHeading
          eyebrow="The Lode"
          title={
            <>
              Eleven biomes.
              <br className="hidden sm:block" /> <span className="gold-text">No edges.</span>
            </>
          }
          blurb="The terrain is a pure function of one seed, so the world is infinite in every direction and identical for every player. Where you stand changes what is under you: yield, rarity curve, weather, even the light."
        />

        <div className="relative mt-16 h-[440px] overflow-hidden rounded-[var(--radius-xl2)] border border-hairline sm:h-[560px]">
          <WorldBackdrop origin={{ x: -2560, y: 3040 }} zoom={0.7} speed={0.55} fadeEdges={false} />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_0%,transparent_45%,rgba(4,5,12,0.9)_100%)]" />
          <div className="absolute bottom-0 left-0 right-0 flex flex-wrap items-end justify-between gap-4 p-6 sm:p-8">
            <div>
              <Chip tone="cyan">Live render · same engine as the game</Chip>
              <p className="display mt-3 max-w-md text-balance text-2xl sm:text-3xl">
                This is not a screenshot. It is the world, running.
              </p>
            </div>
            <LinkButton href="/play" tone="cyan" size="md">
              Drop in →
            </LinkButton>
          </div>
        </div>

        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {BIOME_ORDER.filter((b) => b !== 'shallows' && b !== 'abyss').map((id) => {
            const b = BIOMES[id];
            const top = `rgb(${b.top.r},${b.top.g},${b.top.b})`;
            const side = `rgb(${b.side.r},${b.side.g},${b.side.b})`;
            return (
              <li
                key={id}
                className="glass group relative overflow-hidden rounded-2xl p-5 transition-transform duration-300 hover:-translate-y-1"
              >
                <div
                  className="absolute inset-0 opacity-25 transition-opacity duration-300 group-hover:opacity-45"
                  style={{ background: `linear-gradient(150deg, ${top}, ${side} 70%, transparent)` }}
                />
                <div className="relative">
                  <div className="mb-3 flex items-center justify-between">
                    <span
                      className="block h-7 w-7 rounded-[5px]"
                      style={{
                        background: `linear-gradient(135deg, ${top}, ${side})`,
                        boxShadow: `0 0 20px ${b.accent}55`,
                      }}
                    />
                    <span
                      className="mono text-[10px] uppercase tracking-[0.14em]"
                      style={{ color: b.accent }}
                    >
                      ×{b.yieldBias.toFixed(2)}
                    </span>
                  </div>
                  <div className="display text-[15px]">{b.name}</div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">{b.tagline}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * The vault
 * ------------------------------------------------------------------ */

const PARTS = [
  {
    k: 'Spawn table',
    body: 'Where the loot is, and how much. Derived from a seed that never leaves our servers — you can generate the exact same terrain we do, and still have no idea what is buried in it.',
    accent: '#41f5ff',
  },
  {
    k: 'Claim server',
    body: 'Checks you are really standing on the cache, that nobody has taken it, that your position is reachable from where you last were, and that your excavation proof clears. Then it signs the release.',
    accent: '#a06bff',
  },
  {
    k: 'Vault',
    body: 'Holds the Stock Tokens and only pays out against a valid claim. The ledger records one payout per cache, permanently — a cache that has been opened is empty for everybody.',
    accent: '#ffc44d',
  },
];

export function Vault() {
  return (
    <Section id="vault" className="border-t border-hairline">
      <GridBackdrop />
      <div className="relative grid gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <SectionHeading
            align="left"
            eyebrow="Provenance"
            title={
              <>
                Every fragment was
                <br className="hidden sm:block" /> <span className="gold-text">bought before it spawned.</span>
              </>
            }
            blurb="Nothing here is minted out of thin air. We purchase real tokenised Stock Tokens on Robinhood Chain, deposit them into the vault, and the spawn table distributes exactly what the vault holds."
          />
          <div className="mt-8 flex flex-wrap gap-2">
            <Chip tone="mint">Robinhood Chain · 4663</Chip>
            <Chip tone="cyan">Arbitrum-stack L2</Chip>
            <Chip tone="gold">ERC-20 Stock Tokens</Chip>
            <Chip>Gas in ETH</Chip>
          </div>
          <p className="mt-8 max-w-xl text-[14px] leading-relaxed text-ink-mute">
            Robinhood Chain settles to Ethereum and runs unmodified EVM bytecode, so a payout is
            nothing exotic — it is an ordinary <code className="mono text-ink-dim">transfer()</code>{' '}
            from the vault wallet to yours, visible on the public explorer the moment it is mined.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {PARTS.map((p, i) => (
            <div key={p.k} className="glass relative overflow-hidden rounded-[var(--radius-xl2)] p-6 sm:p-7">
              <div
                className="absolute left-0 top-0 h-full w-[3px]"
                style={{ background: p.accent, boxShadow: `0 0 24px ${p.accent}` }}
              />
              <div className="flex items-baseline gap-3">
                <span className="mono text-[11px] text-ink-mute">0{i + 1}</span>
                <h3 className="display text-lg" style={{ color: p.accent }}>
                  {p.k}
                </h3>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-dim">{p.body}</p>
            </div>
          ))}
          <div className="mono rounded-2xl border border-dashed border-hairline px-5 py-4 text-[12px] leading-relaxed text-ink-mute">
            Running without a vault key? The game is fully playable in simulation — every payout is
            clearly flagged <span className="text-gold">SIMULATED</span> and no transfer is
            broadcast. Nothing ever pretends to be on-chain when it is not.
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * FAQ
 * ------------------------------------------------------------------ */

const FAQS = [
  {
    q: 'Is the stock actually mine?',
    a: 'Yes. The fragment is transferred to the wallet address you linked, on Robinhood Chain, the moment your claim clears. We never hold it for you and there is nothing to withdraw later — it is already yours.',
  },
  {
    q: 'How small is a fragment?',
    a: 'Tiny, and deliberately so. A common cache is a few cents of notional; a mythic runs into the tens of dollars. Stock Tokens are divisible to 18 decimals, so a cache can hold 0.0004 of a share without anything breaking.',
  },
  {
    q: 'Can I just read the map data and teleport to the loot?',
    a: 'You can generate the terrain — it is deterministic and we published how. You cannot generate the loot. Cache positions come from a seed that only the server holds, and the claim server rejects positions you could not have walked to.',
  },
  {
    q: 'What happens when a cache is opened?',
    a: 'It is gone, for everyone, permanently. The claim ledger is checked before the vault signs anything, so the same cache can never pay out twice — even under concurrent claims.',
  },
  {
    q: 'Do I need ETH for gas?',
    a: 'Not to receive. The vault pays the gas on the transfer out. You only need gas if you want to move the fragments somewhere else afterwards.',
  },
  {
    q: 'What is an epoch?',
    a: 'A seeding round. When we deposit a new tranche of Stock Tokens into the vault we bump the epoch, which re-rolls the entire spawn table. Old cache ids stop resolving and the whole map is fresh ground.',
  },
];

export function Faq() {
  return (
    <Section id="faq" className="border-t border-hairline bg-[#05070f]">
      <SectionHeading eyebrow="Questions" title="The parts people ask about" />
      <div className="mx-auto mt-14 grid max-w-4xl gap-3">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className="glass group rounded-2xl px-6 py-5 transition-colors open:bg-white/[0.04]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
              <span className="display text-[16px] sm:text-[17px]">{f.q}</span>
              <span className="mono shrink-0 text-lg text-ink-mute transition-transform duration-300 group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-ink-dim">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Final CTA + footer
 * ------------------------------------------------------------------ */

export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-hairline px-5 py-32 sm:px-8">
      <WorldBackdrop origin={{ x: -960, y: 3360 }} zoom={0.72} speed={0.5} beacons blur={3} scrim />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 50%, rgba(255,196,77,0.14), transparent 65%)',
        }}
      />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <LodeMark size={52} className="animate-[float_7s_ease-in-out_infinite]" />
        <h2 className="display mt-8 text-balance text-[clamp(2.2rem,6vw,4.2rem)] leading-[1.02]">
          The ground is <span className="gold-text">full</span>.
          <br />
          Go take some of it.
        </h2>
        <p className="mt-6 max-w-xl text-pretty text-base text-ink-dim">
          Link a wallet, forge an agent, and load into THE LODE. First sweep is free — they all are.
        </p>
        <LinkButton href="/play" tone="gold" size="lg" className="mt-9">
          Launch the Lode
          <span aria-hidden className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </LinkButton>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-void px-5 py-14 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <LodeMark size={26} />
              <Wordmark />
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-ink-mute">
              An infinite treasure map with real tokenised equity buried in it. Built on Robinhood
              Chain.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <FooterCol
              title="Game"
              links={[
                { label: 'Launch', href: '/play' },
                { label: 'How it works', href: '#how' },
                { label: 'The loot table', href: '#loot' },
                { label: 'Agents', href: '#agents' },
              ]}
            />
            <FooterCol
              title="World"
              links={[
                { label: 'Biomes', href: '#world' },
                { label: 'The vault', href: '#vault' },
                { label: 'FAQ', href: '#faq' },
              ]}
            />
            <FooterCol
              title="Chain"
              links={[
                { label: 'Robinhood Chain', href: 'https://robinhood.com/us/en/chain/' },
                { label: 'Explorer', href: 'https://robinhoodchain.blockscout.com' },
                { label: 'Docs', href: 'https://docs.robinhood.com/chain/connecting' },
              ]}
            />
          </div>
        </div>
        <div className="mt-12">
          <Divider />
        </div>
        <div className="mono mt-6 flex flex-col gap-3 text-[11px] text-ink-mute sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} STOCKFUN · THE LODE</span>
          <span className="max-w-xl text-pretty leading-relaxed">
            Not investment advice. Fragments are tokenised equity on a public chain and carry the
            same market risk as the underlying.
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <div>
      <div className="eyebrow mb-4 text-[10px]">{title}</div>
      <ul className="flex flex-col gap-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              className="text-[13px] text-ink-dim transition-colors hover:text-ink"
              {...(l.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
