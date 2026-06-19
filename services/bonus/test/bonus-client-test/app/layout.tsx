import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bonus Simulator',
  description: 'End-to-end player bonus flow tester',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
