import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentBench Lab',
  description: 'Local-first workspace to inspect and test AI Agent and Skill packages.',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'strict-origin-when-cross-origin'
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
