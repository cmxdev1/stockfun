import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/* ------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------ */

type ButtonTone = 'gold' | 'cyan' | 'ghost' | 'violet';

const TONES: Record<ButtonTone, string> = {
  gold: 'bg-gradient-to-b from-[#ffdd8a] to-[#f0a81f] text-[#1a1002] shadow-[0_10px_34px_-12px_rgba(255,196,77,0.8)] hover:shadow-[0_14px_44px_-10px_rgba(255,196,77,0.95)]',
  cyan: 'bg-gradient-to-b from-[#8ff9ff] to-[#16b6d4] text-[#01161c] shadow-[0_10px_34px_-12px_rgba(65,245,255,0.75)] hover:shadow-[0_14px_44px_-10px_rgba(65,245,255,0.95)]',
  violet:
    'bg-gradient-to-b from-[#cfb2ff] to-[#7a3dff] text-[#0d0320] shadow-[0_10px_34px_-12px_rgba(160,107,255,0.8)]',
  ghost:
    'bg-white/[0.03] text-ink border border-hairline hover:bg-white/[0.07] hover:border-[#2c3a68]',
};

export function Button({
  tone = 'gold',
  size = 'md',
  className = '',
  children,
  ...rest
}: ComponentProps<'button'> & { tone?: ButtonTone; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'h-9 px-4 text-[13px]',
    md: 'h-11 px-6 text-sm',
    lg: 'h-14 px-8 text-base',
  }[size];
  return (
    <button
      {...rest}
      className={`group relative inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition-all duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 ${sizes} ${TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  tone = 'gold',
  size = 'md',
  className = '',
  children,
  href,
  ...rest
}: ComponentProps<typeof Link> & { tone?: ButtonTone; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'h-9 px-4 text-[13px]',
    md: 'h-11 px-6 text-sm',
    lg: 'h-14 px-8 text-base',
  }[size];
  return (
    <Link
      href={href}
      {...rest}
      className={`group relative inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition-all duration-200 active:translate-y-px ${sizes} ${TONES[tone]} ${className}`}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Layout & type
 * ------------------------------------------------------------------ */

export function Chip({
  children,
  tone = 'default',
  className = '',
}: {
  children: ReactNode;
  tone?: 'default' | 'gold' | 'cyan' | 'mint' | 'violet' | 'rose';
  className?: string;
}) {
  const tones = {
    default: 'border-hairline text-ink-dim bg-white/[0.02]',
    gold: 'border-gold/35 text-gold bg-gold/[0.07]',
    cyan: 'border-cyan/35 text-cyan bg-cyan/[0.07]',
    mint: 'border-mint/35 text-mint bg-mint/[0.07]',
    violet: 'border-violet/35 text-violet bg-violet/[0.07]',
    rose: 'border-rose/35 text-rose bg-rose/[0.07]',
  }[tone];
  return (
    <span
      className={`mono inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${tones} ${className}`}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  blurb,
  align = 'center',
}: {
  eyebrow: string;
  title: ReactNode;
  blurb?: ReactNode;
  align?: 'center' | 'left';
}) {
  const alignment = align === 'center' ? 'text-center items-center mx-auto' : 'text-left items-start';
  return (
    <div className={`flex max-w-3xl flex-col gap-4 ${alignment}`}>
      <div className="flex items-center gap-3">
        <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold/70" />
        <span className="eyebrow">{eyebrow}</span>
        <span className="h-px w-8 bg-gradient-to-l from-transparent to-gold/70" />
      </div>
      <h2 className="display text-balance text-4xl leading-[1.05] sm:text-5xl lg:text-[3.4rem]">
        {title}
      </h2>
      {blurb && <p className="text-pretty text-base leading-relaxed text-ink-dim sm:text-lg">{blurb}</p>}
    </div>
  );
}

export function Section({
  id,
  children,
  className = '',
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`relative px-5 py-24 sm:px-8 sm:py-32 ${className}`}>
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

export function GlowCard({
  children,
  className = '',
  glow = 'rgba(65,245,255,0.16)',
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  glow?: string;
  as?: 'div' | 'li' | 'article';
}) {
  return (
    <As
      className={`glass group relative overflow-hidden rounded-[var(--radius-xl2)] p-6 transition-all duration-300 hover:-translate-y-1 ${className}`}
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `radial-gradient(420px 220px at 50% 0%, ${glow}, transparent 70%)` }}
      />
      <div className="relative">{children}</div>
    </As>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = 'gold',
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'gold' | 'cyan' | 'mint' | 'violet';
}) {
  const color = {
    gold: 'text-gold',
    cyan: 'text-cyan',
    mint: 'text-mint',
    violet: 'text-violet',
  }[tone];
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <div className="eyebrow mb-2 text-[10px]">{label}</div>
      <div className={`display text-2xl sm:text-3xl ${color}`}>{value}</div>
      {sub && <div className="mono mt-1 text-[11px] text-ink-mute">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Decoration
 * ------------------------------------------------------------------ */

/** Faint hex-grid backdrop used behind dark sections. */
export function GridBackdrop({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 opacity-[0.16] ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(to right, #1a2b55 1px, transparent 1px), linear-gradient(to bottom, #1a2b55 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        maskImage: 'radial-gradient(75% 60% at 50% 40%, #000 30%, transparent 75%)',
      }}
    />
  );
}

export function Divider() {
  return (
    <div
      aria-hidden
      className="h-px w-full bg-gradient-to-r from-transparent via-[#22305c] to-transparent"
    />
  );
}
