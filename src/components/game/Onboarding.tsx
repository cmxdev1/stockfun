'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { WorldBackdrop } from '@/components/WorldBackdrop';
import { LodeMark, Wordmark } from '@/components/ui/Logo';
import { Button, Chip } from '@/components/ui/primitives';
import {
  connectWallet,
  currentAccount,
  ensureRobinhoodChain,
  hasInjectedWallet,
  isAddressLike,
  shortAddress,
} from '@/lib/wallet';
import type { AgentArchetype, AgentConfig } from '@/game/types';
import { AgentPreview } from './AgentPreview';

export interface OnboardingResult {
  handle: string;
  wallet: string;
  agent: AgentConfig;
}

const ARCHETYPES: Array<{
  id: AgentArchetype;
  name: string;
  hue: number;
  perk: string;
  blurb: string;
}> = [
  { id: 'scout', name: 'Scout', hue: 190, perk: '1.25× speed', blurb: 'Ranges wide, charts fast.' },
  { id: 'digger', name: 'Digger', hue: 38, perk: '1.45× dig rate', blurb: 'Chews through hard ground.' },
  { id: 'oracle', name: 'Oracle', hue: 272, perk: '+0.35 rarity bias', blurb: 'Walks past commons for one legendary.' },
  { id: 'drifter', name: 'Drifter', hue: 150, perk: '1.9× wander', blurb: 'Never idles — hunts richness.' },
];

const NAME_PARTS_A = ['Kes', 'Bram', 'Vor', 'Lux', 'Nyx', 'Ori', 'Sable', 'Quill', 'Ash', 'Rune'];
const NAME_PARTS_B = ['trel', 'ble', 'ax', 'ara', 'is', 'on', 'wing', 'mark', 'fall', 'shard'];

function randomAgentName(): string {
  const a = NAME_PARTS_A[Math.floor(Math.random() * NAME_PARTS_A.length)];
  const b = NAME_PARTS_B[Math.floor(Math.random() * NAME_PARTS_B.length)];
  return `${a}${b}`;
}

export function Onboarding({
  onComplete,
  busy,
  error,
}: {
  onComplete: (result: OnboardingResult) => void;
  busy: boolean;
  error: string | null;
}) {
  const [step, setStep] = useState(0);
  const [wallet, setWallet] = useState('');
  const [manual, setManual] = useState('');
  const [walletError, setWalletError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [handle, setHandle] = useState('');
  const [agentName, setAgentName] = useState(randomAgentName);
  const [archetype, setArchetype] = useState<AgentArchetype>('scout');
  const [range, setRange] = useState(0.55);
  const [greed, setGreed] = useState(0.5);
  const [hue, setHue] = useState(190);
  const [autonomous, setAutonomous] = useState(true);

  useEffect(() => {
    currentAccount().then((acct) => {
      if (acct) setWallet(acct);
    });
  }, []);

  useEffect(() => {
    const preset = ARCHETYPES.find((a) => a.id === archetype);
    if (preset) setHue(preset.hue);
  }, [archetype]);

  const agent: AgentConfig = useMemo(
    () => ({ name: agentName.trim(), archetype, range, greed, hue, autonomous }),
    [agentName, archetype, range, greed, hue, autonomous],
  );

  const handleOk = handle.trim().length >= 3;
  const walletOk = isAddressLike(wallet);
  const agentOk = agent.name.length >= 2;

  const doConnect = async () => {
    setConnecting(true);
    setWalletError(null);
    try {
      const acct = await connectWallet();
      const net = await ensureRobinhoodChain();
      if (!net.ok) setWalletError(`${net.error} — you can still play; payouts go to this address.`);
      setWallet(acct);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Wallet connection failed.');
    } finally {
      setConnecting(false);
    }
  };

  const steps = ['Link', 'Identity', 'Forge', 'Launch'];

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <WorldBackdrop origin={{ x: 1440, y: -800 }} zoom={0.72} speed={0.45} blur={3} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(76% 66% at 50% 42%, rgba(4,5,12,0.30), rgba(4,5,12,0.86) 78%)',
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-8 sm:px-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <LodeMark size={26} />
            <Wordmark />
          </Link>
          <div className="hidden items-center gap-2 sm:flex">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span
                  className={`mono rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.16em] transition-colors ${
                    i === step
                      ? 'bg-gold/15 text-gold'
                      : i < step
                        ? 'text-mint'
                        : 'text-ink-mute'
                  }`}
                >
                  {i < step ? '✓' : `0${i + 1}`} {s}
                </span>
                {i < steps.length - 1 && <span className="h-px w-5 bg-hairline" />}
              </div>
            ))}
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="glass-strong w-full rounded-[28px] p-7 sm:p-10">
            {/* ---------------- Step 0 — wallet ---------------- */}
            {step === 0 && (
              <div className="animate-[rise_0.5s_both]">
                <Chip tone="mint">Step 01 · Link a wallet</Chip>
                <h1 className="display mt-5 text-balance text-3xl leading-tight sm:text-4xl">
                  Where should the <span className="gold-text">stock</span> go?
                </h1>
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-dim">
                  Every fragment you dig up is transferred to this address on Robinhood Chain the
                  moment your claim clears. We never hold it for you.
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={doConnect}
                    disabled={connecting || !hasInjectedWallet()}
                    className="glass group relative overflow-hidden rounded-2xl p-6 text-left transition-all hover:-translate-y-0.5 disabled:opacity-45"
                  >
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-mint to-transparent opacity-70" />
                    <div className="display text-lg">
                      {connecting ? 'Requesting…' : 'Connect browser wallet'}
                    </div>
                    <p className="mt-2 text-[13px] text-ink-dim">
                      {hasInjectedWallet()
                        ? 'MetaMask, Rabby, or any injected EVM wallet. We will offer to add Robinhood Chain.'
                        : 'No injected wallet detected in this browser.'}
                    </p>
                  </button>

                  <div className="glass rounded-2xl p-6">
                    <div className="display text-lg">Paste an address</div>
                    <p className="mt-2 text-[13px] text-ink-dim">
                      Works exactly the same — payouts land wherever you point them.
                    </p>
                    <input
                      value={manual}
                      onChange={(e) => setManual(e.target.value)}
                      onBlur={() => {
                        if (isAddressLike(manual)) setWallet(manual.trim());
                      }}
                      placeholder="0x…"
                      spellCheck={false}
                      className="mono mt-4 w-full rounded-xl border border-hairline bg-void/60 px-3 py-2.5 text-[13px] text-ink outline-none transition-colors focus:border-cyan/50"
                    />
                  </div>
                </div>

                {walletError && (
                  <p className="mono mt-4 text-[12px] text-gold">{walletError}</p>
                )}

                {walletOk && (
                  <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-mint/25 bg-mint/[0.06] px-5 py-4">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
                    </span>
                    <span className="mono text-[13px] text-mint">{shortAddress(wallet)}</span>
                    <span className="text-[13px] text-ink-dim">linked and ready</span>
                  </div>
                )}

                <div className="mt-8 flex justify-end">
                  <Button
                    tone="gold"
                    disabled={!walletOk}
                    onClick={() => setStep(1)}
                  >
                    Continue →
                  </Button>
                </div>
              </div>
            )}

            {/* ---------------- Step 1 — handle ---------------- */}
            {step === 1 && (
              <div className="animate-[rise_0.5s_both]">
                <Chip tone="cyan">Step 02 · Identity</Chip>
                <h1 className="display mt-5 text-balance text-3xl leading-tight sm:text-4xl">
                  Name your prospector
                </h1>
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-dim">
                  This is the name that shows above your avatar in the world and on the epoch
                  leaderboard.
                </p>

                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.slice(0, 20))}
                  placeholder="veinwalker"
                  autoFocus
                  spellCheck={false}
                  className="display mt-8 w-full rounded-2xl border border-hairline bg-void/60 px-5 py-5 text-3xl text-ink outline-none transition-colors placeholder:text-ink-mute/50 focus:border-cyan/50"
                />
                <div className="mono mt-3 flex justify-between text-[11px] text-ink-mute">
                  <span>{handleOk ? 'Looks good.' : 'At least 3 characters.'}</span>
                  <span>{handle.length}/20</span>
                </div>

                <div className="mt-8 flex justify-between">
                  <Button tone="ghost" onClick={() => setStep(0)}>
                    ← Back
                  </Button>
                  <Button tone="gold" disabled={!handleOk} onClick={() => setStep(2)}>
                    Forge the agent →
                  </Button>
                </div>
              </div>
            )}

            {/* ---------------- Step 2 — agent ---------------- */}
            {step === 2 && (
              <div className="animate-[rise_0.5s_both]">
                <Chip tone="violet">Step 03 · Forge</Chip>
                <h1 className="display mt-5 text-balance text-3xl leading-tight sm:text-4xl">
                  Build the thing you play through
                </h1>

                <div className="mt-8 grid gap-8 lg:grid-cols-[210px_1fr]">
                  <div className="flex flex-col items-center">
                    <AgentPreview hue={hue} archetype={archetype} autonomous={autonomous} />
                    <input
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value.slice(0, 24))}
                      className="display mt-2 w-full rounded-xl border border-hairline bg-void/60 px-3 py-2 text-center text-lg outline-none focus:border-cyan/50"
                    />
                    <button
                      type="button"
                      onClick={() => setAgentName(randomAgentName())}
                      className="mono mt-2 text-[11px] uppercase tracking-[0.16em] text-ink-mute transition-colors hover:text-cyan"
                    >
                      ↻ Reroll name
                    </button>
                  </div>

                  <div className="flex flex-col gap-6">
                    <div>
                      <div className="eyebrow mb-3">Archetype</div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {ARCHETYPES.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setArchetype(a.id)}
                            className={`rounded-xl border p-3 text-left transition-all ${
                              archetype === a.id
                                ? 'border-transparent bg-white/[0.07]'
                                : 'border-hairline hover:bg-white/[0.04]'
                            }`}
                            style={
                              archetype === a.id
                                ? { boxShadow: `0 0 0 1px hsla(${a.hue},90%,60%,0.7), 0 0 30px -8px hsla(${a.hue},90%,60%,0.9)` }
                                : undefined
                            }
                          >
                            <div
                              className="display text-[15px]"
                              style={{ color: `hsl(${a.hue},90%,70%)` }}
                            >
                              {a.name}
                            </div>
                            <div className="mono mt-1 text-[10px] text-ink-mute">{a.perk}</div>
                            <div className="mt-1.5 text-[11px] leading-snug text-ink-dim">
                              {a.blurb}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <Slider
                      label="Range"
                      hint="How far it strays from you"
                      value={range}
                      onChange={setRange}
                      left="Tight"
                      right="Far"
                    />
                    <Slider
                      label="Greed"
                      hint="Rarity over proximity"
                      value={greed}
                      onChange={setGreed}
                      left="Safe"
                      right="Reckless"
                    />

                    <div>
                      <div className="eyebrow mb-3">Aura</div>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        value={hue}
                        onChange={(e) => setHue(Number(e.target.value))}
                        className="w-full"
                        style={{
                          background:
                            'linear-gradient(90deg,#ff4d4d,#ffd04d,#6dffa8,#41f5ff,#a06bff,#ff5f8f)',
                          borderRadius: 99,
                          height: 6,
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setAutonomous((v) => !v)}
                      className="flex items-center justify-between rounded-xl border border-hairline px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                    >
                      <div>
                        <div className="text-[14px] font-semibold">Autonomous hunting</div>
                        <div className="text-[12px] text-ink-dim">
                          {autonomous
                            ? 'Your agent hunts signals on its own while you steer the prospector.'
                            : 'Your agent stays in escort formation beside you.'}
                        </div>
                      </div>
                      <span
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                          autonomous ? 'bg-mint/70' : 'bg-hairline'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                            autonomous ? 'left-[22px]' : 'left-0.5'
                          }`}
                        />
                      </span>
                    </button>
                  </div>
                </div>

                <div className="mt-8 flex justify-between">
                  <Button tone="ghost" onClick={() => setStep(1)}>
                    ← Back
                  </Button>
                  <Button tone="gold" disabled={!agentOk} onClick={() => setStep(3)}>
                    Review →
                  </Button>
                </div>
              </div>
            )}

            {/* ---------------- Step 3 — launch ---------------- */}
            {step === 3 && (
              <div className="animate-[rise_0.5s_both]">
                <Chip tone="gold">Step 04 · Launch</Chip>
                <h1 className="display mt-5 text-balance text-3xl leading-tight sm:text-4xl">
                  Ready to drop in
                </h1>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  <Summary label="Prospector" value={handle} tone="text-cyan" />
                  <Summary label="Wallet" value={shortAddress(wallet)} tone="text-mint" mono />
                  <Summary
                    label="Agent"
                    value={`${agent.name} · ${archetype}`}
                    tone="text-violet"
                  />
                </div>

                <div className="mt-6 flex items-center gap-5 rounded-2xl border border-hairline bg-white/[0.02] p-5">
                  <AgentPreview hue={hue} archetype={archetype} autonomous={autonomous} size={110} />
                  <div className="text-[13px] leading-relaxed text-ink-dim">
                    <p>
                      Your spawn point is derived from your wallet address, so you will always drop
                      into the same corner of THE LODE.
                    </p>
                    <p className="mono mt-3 text-[11px] text-ink-mute">
                      WASD or click to move · SPACE to scan · E to dig · scroll to zoom
                    </p>
                  </div>
                </div>

                {error && (
                  <p className="mono mt-5 rounded-xl border border-rose/30 bg-rose/[0.08] px-4 py-3 text-[12px] text-rose">
                    {error}
                  </p>
                )}

                <div className="mt-8 flex justify-between">
                  <Button tone="ghost" onClick={() => setStep(2)} disabled={busy}>
                    ← Back
                  </Button>
                  <Button
                    tone="gold"
                    size="lg"
                    disabled={busy || !walletOk || !handleOk || !agentOk}
                    onClick={() => onComplete({ handle: handle.trim(), wallet, agent })}
                  >
                    {busy ? 'Opening the world…' : 'Enter THE LODE'}
                    <span aria-hidden>→</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  onChange,
  left,
  right,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  left: string;
  right: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        <span className="mono text-[11px] text-ink-mute">{hint}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full"
      />
      <div className="mono mt-1 flex justify-between text-[10px] uppercase tracking-[0.14em] text-ink-mute">
        <span>{left}</span>
        <span className="text-cyan">{Math.round(value * 100)}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-white/[0.02] px-5 py-4">
      <div className="eyebrow mb-2 text-[10px]">{label}</div>
      <div className={`${mono ? 'mono text-[15px]' : 'display text-lg'} truncate ${tone}`}>
        {value}
      </div>
    </div>
  );
}
