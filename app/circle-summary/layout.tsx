import type { Metadata } from 'next';
import { Open_Sans } from 'next/font/google';
import './circle-summary.css';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-cs-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Circle Summary — Valley Creek',
};

export default function CircleSummaryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${openSans.variable} cs-root min-h-screen bg-white`}>
      {children}
    </div>
  );
}
