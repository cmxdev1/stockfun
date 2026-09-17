'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LodeEngine, SCAN_COOLDOWN, SCAN_RADIUS } from '@/game/engine';
import { LodeRenderer, dayGrade } from '@/game/renderer';
import { WORLD } from '@/game/world';
import { RARITIES } from '@/game/drops';
import { solvePowSlice } from '@/lib/pow';
import { levelFromXp } from '@/lib/store.client';
import type {
  AgentConfig,
  CacheSignal,
  ClaimResult,
  PlayerProfile,
  Vec2,
} from '@/game/types';
import { Onboarding, type OnboardingResult } from './Onboarding';
import { RevealModal } from './RevealModal';
import {
  ActionBar,
  AgentPanel,
  HaulPanel,
  LogStack,
  Minimap,
  KeyLegend,
  SignalPanel,
  SignalStrip,
  TopBar,
  type HaulEntry,
  type LogEntry,
} from './Hud';
import { BootVeil } from './BootVeil';
import { ProfileMenu } from './ProfileMenu';

const STORAGE_KEY = 'stockfun.credentials.v1';

interface Credentials {
  playerId: string;
  secret: string;
}

interface HudSnapshot {
  player: Vec2;
  agent: Vec2;
  signals: CacheSignal[];
  focusId: string | null;
  biomeName: string;
  biomeAccent: string;
  altitude: number;
  richness: number;
  dayLabel: string;
  scanCooldown: number;
  zoom: number;
  digReady: boolean;
  digging: boolean;
  digProgress: number;
  agentDistance: number;
  discoveredCount: number;
}

function readCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}

export function GameClient() {
  const [phase, setPhase] = useState<'boot' | 'onboarding' | 'loading' | 'playing'>('boot');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [spawn, setSpawn] = useState<Vec2>({ x: 0, y: 0 });
  const [epoch, setEpoch] = useState(0);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<ClaimResult | null>(null);
  const [haul, setHaul] = useState<HaulEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [xp, setXp] = useState(0);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [explorerBase, setExplorerBase] = useState('https://robinhoodchain.blockscout.com');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<LodeEngine | null>(null);
  const rendererRef = useRef<LodeRenderer | null>(null);
  const credsRef = useRef<Credentials | null>(null);
  const logSeq = useRef(0);
  const toggleAutonomyRef = useRef<() => void>(() => {});
  const powRef = useRef<{ cacheId: string; cursor: number; nonce: number | null } | null>(null);
  const pendingClaim = useRef<CacheSignal | null>(null);
  const claiming = useRef(false);

  const log = useCallback((message: string, tone: LogEntry['tone'] = 'info') => {
    logSeq.current += 1;
    const entry = { id: logSeq.current, message, tone };
    setLogs((prev) => [...prev.slice(-6), entry]);
    setTimeout(() => {
      setLogs((prev) => prev.filter((l) => l.id !== entry.id));
    }, 5200);
  }, []);

  /* ---------------------------------------------------------------- *
   * Boot — resume an existing prospector if we have credentials
   * ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const worldRes = await fetch('/api/world', { cache: 'no-store' });
        if (worldRes.ok) {
          const w = await worldRes.json();
          if (!cancelled) {
            setEpoch(w.epoch ?? 0);
            setLive(Boolean(w.chain?.live));
            if (w.chain?.explorer) setExplorerBase(w.chain.explorer);
          }
        }
      } catch {
        /* offline-tolerant: the world still renders */
      }

      const creds = readCredentials();
      if (!creds) {
        if (!cancelled) setPhase('onboarding');
        return;
      }
      try {
        const res = await fetch(
          `/api/profile?id=${encodeURIComponent(creds.playerId)}&secret=${encodeURIComponent(creds.secret)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error('stale credentials');
        const data = await res.json();
        if (cancelled) return;
        credsRef.current = creds;
        setProfile(data.profile);
        setSpawn(data.spawn);
        setXp(data.profile.xp);
        setPhase('loading');
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        if (!cancelled) setPhase('onboarding');
      }
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const startSession = useCallback(
    async (result: OnboardingResult) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(result),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Could not create your prospector.');
        const creds: Credentials = { playerId: data.profile.id, secret: data.secret };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
        credsRef.current = creds;
        setProfile(data.profile);
        setSpawn(data.spawn);
        setXp(data.profile.xp);
        setPhase('loading');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  /* ---------------------------------------------------------------- *
   * Scanning
   * ---------------------------------------------------------------- */

  const runScan = useCallback(
    async (x: number, y: number) => {
      const creds = credsRef.current;
      if (!creds) return;
      setScanning(true);
      try {
        const params = new URLSearchParams({
          x: String(x),
          y: String(y),
          r: String(SCAN_RADIUS),
          playerId: creds.playerId,
          secret: creds.secret,
        });
        const res = await fetch(`/api/signals?${params}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('scan failed');
        const data = (await res.json()) as { signals: CacheSignal[]; epoch: number };
        engineRef.current?.setSignals(data.signals);
        setEpoch(data.epoch);
        const open = data.signals.filter((s) => !s.claimed).length;
        log(
          open === 0
            ? 'Sweep clean. Nothing buried inside the radius.'
            : `${open} signal${open === 1 ? '' : 's'} resolved.`,
          open === 0 ? 'warn' : 'good',
        );
      } catch {
        log('Scanner lost contact with the claim server.', 'warn');
      } finally {
        setScanning(false);
      }
    },
    [log],
  );

  /* ---------------------------------------------------------------- *
   * Claiming
   * ---------------------------------------------------------------- */

  const submitClaim = useCallback(
    async (signal: CacheSignal, nonce: number) => {
      const creds = credsRef.current;
      const engine = engineRef.current;
      if (!creds || !engine || claiming.current) return;
      claiming.current = true;
      try {
        const res = await fetch('/api/claim', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            playerId: creds.playerId,
            secret: creds.secret,
            cacheId: signal.id,
            nonce,
            x: Math.round(engine.player.x),
            y: Math.round(engine.player.y),
          }),
        });
        const data = (await res.json()) as ClaimResult;
        if (!res.ok || !data.ok) {
          log(data.error ?? 'The vault refused that claim.', 'warn');
          engine.markClaimed(signal.id);
          return;
        }
        engine.markClaimed(signal.id);
        setReveal(data);
        setXp((v) => v + (data.xp ?? 0));
        setHaul((prev) => [
          {
            ticker: data.ticker!,
            fragment: data.fragment!,
            notionalUsd: data.notionalUsd!,
            rarity: data.rarity!,
            at: Date.now(),
          },
          ...prev,
        ]);
      } catch {
        log('Claim failed — the network dropped mid-transfer.', 'warn');
      } finally {
        claiming.current = false;
        powRef.current = null;
        pendingClaim.current = null;
      }
    },
    [log],
  );

  /* ---------------------------------------------------------------- *
   * Engine + renderer lifecycle
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (phase !== 'loading' && phase !== 'playing') return;
    if (!profile) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (engineRef.current) return;

    let renderer: LodeRenderer;
    try {
      renderer = new LodeRenderer(canvas, WORLD.seed);
    } catch {
      setError('This browser cannot open a 2D canvas context.');
      return;
    }
    rendererRef.current = renderer;

    const engine = new LodeEngine(
      {
        spawn,
        agent: profile.agent,
        handle: profile.handle,
        level: levelFromXp(profile.xp),
      },
      {
        onScan: runScan,
        onDiscover: () => {},
        onLog: log,
        onMineComplete: (signal) => {
          // Excavation finished. Hold the claim until the proof is solved.
          const pow = powRef.current;
          if (pow && pow.cacheId === signal.id && pow.nonce !== null) {
            void submitClaim(signal, pow.nonce);
          } else {
            pendingClaim.current = signal;
            log('Sealing the excavation proof…', 'info');
          }
        },
      },
    );
    engineRef.current = engine;

    let raf = 0;
    let last = performance.now();
    let hudAccum = 0;

    const loop = (now: number) => {
      // Always re-arm first: a throw further down must not end the session.
      raf = requestAnimationFrame(loop);
      const dt = (now - last) / 1000;
      last = now;
      engine.step(dt);

      // Proof-of-effort runs in slices between frames so the world never stalls.
      const mining = engine.mining;
      if (mining) {
        if (!powRef.current || powRef.current.cacheId !== mining.signal.id) {
          powRef.current = { cacheId: mining.signal.id, cursor: 0, nonce: null };
        }
        const pow = powRef.current;
        if (pow.nonce === null) {
          const slice = solvePowSlice(
            pow.cacheId,
            credsRef.current?.playerId ?? '',
            epoch,
            RARITIES[mining.signal.rarity].difficulty,
            pow.cursor,
            14_000,
          );
          pow.nonce = slice.nonce;
          pow.cursor = slice.next;
        }
      }

      const pending = pendingClaim.current;
      if (pending) {
        const pow = powRef.current;
        if (pow && pow.cacheId === pending.id) {
          if (pow.nonce === null) {
            const slice = solvePowSlice(
              pow.cacheId,
              credsRef.current?.playerId ?? '',
              epoch,
              RARITIES[pending.rarity].difficulty,
              pow.cursor,
              60_000,
            );
            pow.nonce = slice.nonce;
            pow.cursor = slice.next;
          }
          if (pow.nonce !== null) {
            pendingClaim.current = null;
            void submitClaim(pending, pow.nonce);
          }
        } else {
          pendingClaim.current = null;
        }
      }

      renderer.render(engine.toRenderState());

      hudAccum += dt;
      if (hudAccum > 0.1) {
        hudAccum = 0;
        const reach = engine.cacheInReach();
        setHud({
          player: { x: engine.player.x, y: engine.player.y },
          agent: { x: engine.agent.x, y: engine.agent.y },
          signals: engine.signals,
          focusId: engine.focusId,
          biomeName: engine.biome.name,
          biomeAccent: engine.biome.accent,
          altitude: engine.altitude,
          richness: engine.richness,
          dayLabel: dayGrade(engine.dayT).label,
          scanCooldown: engine.scanReadyIn,
          zoom: engine.targetZoom,
          digReady: Boolean(reach),
          digging: Boolean(engine.mining),
          digProgress: engine.mining?.progress ?? 0,
          agentDistance: Math.hypot(engine.agent.x - engine.player.x, engine.agent.y - engine.player.y),
          discoveredCount: engine.discovered.size,
        });
      }
    };

    raf = requestAnimationFrame(loop);
    setPhase('playing');
    // First sweep is automatic so the board is never empty on arrival.
    const firstScan = setTimeout(() => engine.scan(), 900);

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(firstScan);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      rendererRef.current = null;
      engineRef.current = null;
    };
    // The engine owns its own lifecycle; re-creating it would reset the world.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'loading' || phase === 'playing', profile?.id]);

  /* ---------------------------------------------------------------- *
   * Input
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (phase !== 'playing') return;

    const keyMap: Record<string, keyof LodeEngine['input']> = {
      w: 'up',
      arrowup: 'up',
      s: 'down',
      arrowdown: 'down',
      a: 'left',
      arrowleft: 'left',
      d: 'right',
      arrowright: 'right',
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      const k = e.key.toLowerCase();
      if (keyMap[k]) {
        engine.input[keyMap[k]] = true;
        e.preventDefault();
        return;
      }
      if (k === ' ') {
        e.preventDefault();
        if (!engine.scan()) log(`Scanner recharging — ${engine.scanReadyIn.toFixed(1)}s`, 'warn');
      }
      if (k === 'e') {
        if (engine.mining) engine.strike();
        else if (!engine.beginMining()) log('Nothing within reach to dig.', 'warn');
      }
      if (k === 'f') toggleAutonomyRef.current();
      if (k === 'escape') engine.cancelMining();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      const k = e.key.toLowerCase();
      if (keyMap[k]) engine.input[keyMap[k]] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [phase, log]);

  const onCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const renderer = rendererRef.current;
    if (!engine || !renderer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    engine.setHover(
      renderer.pickTile(e.clientX - rect.left, e.clientY - rect.top, engine.camera),
    );
  }, []);

  const onCanvasClick = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const renderer = rendererRef.current;
    if (!engine || !renderer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const tile = renderer.pickTile(e.clientX - rect.left, e.clientY - rect.top, engine.camera);
    // Clicking a beacon tracks it; clicking the ground walks there.
    const onCache = engine.signals.find(
      (s) => !s.claimed && Math.abs(s.x - tile.x) <= 1 && Math.abs(s.y - tile.y) <= 1,
    );
    if (onCache) engine.travelTo(onCache);
    else engine.moveTo(tile);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    engineRef.current?.nudgeZoom(e.deltaY);
  }, []);

  /** Clear the local session and go back through onboarding with a new wallet. */
  const switchWallet = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private browsing — the in-memory reset below is enough */
    }
    window.location.reload();
  }, []);

  /* ---------------------------------------------------------------- *
   * Agent autonomy toggle (persisted)
   * ---------------------------------------------------------------- */

  /** Apply an agent change locally at once, then persist it in the background. */
  const persistAgent = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tuneAgent = useCallback((patch: Partial<AgentConfig>) => {
    const engine = engineRef.current;
    const creds = credsRef.current;
    if (!engine || !creds) return;
    const next: AgentConfig = { ...engine.agentConfig, ...patch };
    engine.agentConfig = next;
    setProfile((p) => (p ? { ...p, agent: next } : p));

    // Sliders fire continuously — debounce the write rather than the change.
    if (persistAgent.current) clearTimeout(persistAgent.current);
    persistAgent.current = setTimeout(() => {
      fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: creds.playerId, secret: creds.secret, agent: next }),
      }).catch(() => {
        /* the local change still applies for this session */
      });
    }, 500);
  }, []);

  const toggleAutonomy = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const autonomous = !engine.agentConfig.autonomous;
    tuneAgent({ autonomous });
    log(
      autonomous
        ? `${engine.agentConfig.name} is hunting on its own.`
        : `${engine.agentConfig.name} falls in beside you.`,
    );
  }, [log, tuneAgent]);

  useEffect(() => {
    toggleAutonomyRef.current = toggleAutonomy;
  }, [toggleAutonomy]);

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  if (phase === 'boot') return <BootVeil message="Reading the survey logs…" />;

  if (phase === 'onboarding') {
    return <Onboarding onComplete={startSession} busy={busy} error={error} />;
  }

  const level = levelFromXp(xp);
  const xpFloor = Math.pow(level - 1, 2) * 120;
  const xpCeil = Math.pow(level, 2) * 120;
  const totalHaul = haul.reduce((a, h) => a + h.notionalUsd, 0);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-void">
      <canvas
        ref={canvasRef}
        onPointerMove={onCanvasPointerMove}
        onPointerDown={onCanvasClick}
        onWheel={onWheel}
        onPointerLeave={() => engineRef.current?.setHover(null)}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {phase === 'loading' && <BootVeil message="Generating terrain…" />}

      {hud && profile && (
        <div className="pointer-events-none absolute inset-0 flex flex-col">
          <TopBar
            handle={profile.handle}
            level={level}
            xp={xp - xpFloor}
            xpToNext={Math.max(1, xpCeil - xpFloor)}
            biome={{
              id: 'verdant',
              name: hud.biomeName,
              tagline: '',
              top: { r: 0, g: 0, b: 0 },
              topAlt: { r: 0, g: 0, b: 0 },
              side: { r: 0, g: 0, b: 0 },
              accent: hud.biomeAccent,
              yieldBias: 1,
              mood: '',
            }}
            player={hud.player}
            dayLabel={hud.dayLabel}
            epoch={epoch}
            live={live}
            altitude={hud.altitude}
            richness={hud.richness}
            slot={
              <ProfileMenu
                profile={profile}
                level={level}
                xp={xp}
                claims={haul.length + profile.claims}
                haulUsd={totalHaul}
                explorerBase={explorerBase}
                onSwitch={switchWallet}
              />
            }
          />

          <div className="flex flex-1 items-start justify-between gap-3 px-3 sm:px-4">
            <div className="hidden flex-col gap-3 lg:flex">
              <AgentPanel
                agent={profile.agent}
                onToggleAutonomy={toggleAutonomy}
                onTune={tuneAgent}
                distance={hud.agentDistance}
              />
              <HaulPanel haul={haul} total={totalHaul} />
            </div>

            <div className="ml-auto">
              <SignalPanel
                signals={hud.signals}
                player={hud.player}
                focusId={hud.focusId}
                scanning={scanning}
                onTrack={(s) => engineRef.current?.travelTo(s)}
              />
            </div>
          </div>

          <div className="flex items-end justify-between gap-3 px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="pointer-events-auto hidden sm:block">
              <Minimap
                player={hud.player}
                agent={hud.agent}
                signals={hud.signals}
                seed={WORLD.seed}
                discoveredCount={hud.discoveredCount}
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
              <LogStack entries={logs} />
              <div className="w-full sm:hidden">
                <SignalStrip
                  signals={hud.signals}
                  player={hud.player}
                  focusId={hud.focusId}
                  onTrack={(s) => engineRef.current?.travelTo(s)}
                />
              </div>
              <ActionBar
                onScan={() => {
                  const engine = engineRef.current;
                  if (engine && !engine.scan()) {
                    log(`Scanner recharging — ${engine.scanReadyIn.toFixed(1)}s`, 'warn');
                  }
                }}
                scanCooldown={hud.scanCooldown}
                scanMax={SCAN_COOLDOWN}
                onDig={() => {
                  const engine = engineRef.current;
                  if (!engine) return;
                  if (engine.mining) engine.strike();
                  else if (!engine.beginMining()) log('Nothing within reach to dig.', 'warn');
                }}
                digReady={hud.digReady}
                digging={hud.digging}
                digProgress={hud.digProgress}
                onZoom={(dir) =>
                  engineRef.current?.setZoom((engineRef.current?.targetZoom ?? 1) + dir * 0.12)
                }
                zoom={hud.zoom}
              />
            </div>

            <div className="hidden w-[184px] justify-end lg:flex">
              <KeyLegend />
            </div>
          </div>
        </div>
      )}

      {reveal && <RevealModal result={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}
