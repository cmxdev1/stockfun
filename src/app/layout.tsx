import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://stockfun.example'),
  title: {
    default: 'STOCKFUN — Mine real stock in THE LODE',
    template: '%s · STOCKFUN',
  },
  description:
    'An infinite metaverse treasure map where fragments of tokenised Stock Tokens are buried at random coordinates. Forge an agent, scan the ground, dig, and the fragment lands in your Robinhood Chain wallet the instant you open the cache.',
  keywords: [
    'stock tokens',
    'Robinhood Chain',
    'treasure hunt game',
    'metaverse',
    'tokenised equities',
    'web3 game',
  ],
  openGraph: {
    title: 'STOCKFUN — Mine real stock in THE LODE',
    description:
      'Forge an agent. Scan an infinite procedural world. Dig up fragments of real tokenised stock, paid straight to your wallet.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: '#04050c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-dvh bg-void text-ink antialiased">{children}</body>
    </html>
  );
}
