import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Akselera.Tech Internal Chat',
  description: 'Internal chat platform for Akselera.Tech',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={nunito.className}>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
