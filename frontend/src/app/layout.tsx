import { Bricolage_Grotesque } from 'next/font/google';

const ui = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
