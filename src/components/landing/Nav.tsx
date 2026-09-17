'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LodeMark, Wordmark } from '@/components/ui/Logo';
import { LinkButton } from '@/components/ui/primitives';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#loot', label: 'The loot' },
  { href: '#agents', label: 'Agents' },
  { href: '#world', label: 'The world' },
  { href: '#vault', label: 'The vault' },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? 'py-2' : 'py-4'
      }`}
    >
      <nav
        className={`mx-auto flex w-[min(1200px,calc(100%-2rem))] items-center justify-between rounded-full px-3 py-2 transition-all duration-300 ${
          scrolled ? 'glass shadow-2xl' : 'border border-transparent'
        }`}
      >
        <Link href="/" className="group flex items-center gap-2.5 pl-2">
          <LodeMark size={28} className="transition-transform duration-500 group-hover:rotate-[14deg]" />
          <Wordmark />
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-4 py-2 text-[13px] font-medium text-ink-dim transition-colors hover:bg-white/[0.05] hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <LinkButton href="/play" tone="gold" size="sm" className="hidden sm:inline-flex">
            Launch the Lode
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </LinkButton>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
            className="grid h-10 w-10 place-items-center rounded-full border border-hairline text-ink-dim lg:hidden"
          >
            <span className="flex flex-col gap-1">
              <span className="block h-px w-4 bg-current" />
              <span className="block h-px w-4 bg-current" />
              <span className="block h-px w-4 bg-current" />
            </span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="glass mx-auto mt-2 w-[min(1200px,calc(100%-2rem))] rounded-3xl p-3 lg:hidden">
          <div className="flex flex-col">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-2xl px-4 py-3 text-sm text-ink-dim hover:bg-white/[0.05] hover:text-ink"
              >
                {l.label}
              </a>
            ))}
            <LinkButton href="/play" tone="gold" size="md" className="mt-2 w-full">
              Launch the Lode →
            </LinkButton>
          </div>
        </div>
      )}
    </header>
  );
}
