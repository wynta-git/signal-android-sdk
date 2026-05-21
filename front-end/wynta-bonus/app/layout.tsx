import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import DjHeaderSlot from 'wynta-react-common/components/DjHeaderSlot';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', weight: ['400', '500', '600', '700'] });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', weight: ['400', '500', '600'] });

export const metadata = {
  title: 'Wynta Bonus Admin — Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body style={{ backgroundColor: 'rgb(192, 200, 215)' }}>
        <DjHeaderSlot />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
