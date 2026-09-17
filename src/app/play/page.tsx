import type { Metadata } from 'next';
import { GameClient } from '@/components/game/GameClient';

export const metadata: Metadata = {
  title: 'Enter THE LODE',
  description:
    'Load your agent into an infinite procedural world and dig up fragments of real tokenised stock, paid straight to your Robinhood Chain wallet.',
};

export default function PlayPage() {
  return <GameClient />;
}
