import { Nav } from '@/components/landing/Nav';
import { Hero } from '@/components/landing/Hero';
import { TickerTape } from '@/components/landing/TickerTape';
import { Leaderboard } from '@/components/landing/Leaderboard';
import {
  Agents,
  Faq,
  FinalCta,
  Footer,
  HowItWorks,
  Loot,
  Vault,
  World,
} from '@/components/landing/sections';

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <TickerTape />
        <HowItWorks />
        <Loot />
        <Agents />
        <World />
        <Vault />
        <Leaderboard />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
