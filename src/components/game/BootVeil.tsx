'use client';

import { useEffect, useState } from 'react';
import { LodeMark, Wordmark } from '@/components/ui/Logo';

const LINES = [
  'Seeding continents',
  'Carving mineral veins',
  'Placing the vault',
  'Waking your agent',
  'Charting the first chunks',
];

/** Loading veil. Sits over the canvas while the first chunks bake. */
export function BootVeil({ message }: { message: string }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % LINES.length), 700);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-void">
      <div className="flex flex-col items-center gap-6">
        <LodeMark size={46} className="animate-[float_4s_ease-in-out_infinite]" />
        <Wordmark className="text-xl" />
        <div className="h-px w-48 overflow-hidden bg-hairline">
          <div className="h-full w-1/3 animate-[marquee_1.4s_linear_infinite] bg-gradient-to-r from-transparent via-cyan to-transparent" />
        </div>
        <div className="mono text-[11px] uppercase tracking-[0.24em] text-ink-mute">
          {message}
        </div>
        <div className="mono h-4 text-[10px] uppercase tracking-[0.2em] text-cyan/70">
          {LINES[i]}…
        </div>
      </div>
    </div>
  );
}
