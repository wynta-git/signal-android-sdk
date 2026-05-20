import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'Wynta',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: 'rgb(192, 200, 215)' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
