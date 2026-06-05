import 'wynta-react-common/app/globals.css';
import './globals.css';
import Providers from './providers';
import DjHeaderSlot from 'wynta-react-common/components/DjHeaderSlot';

export const metadata = {
  title: 'Wynta CRM',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <DjHeaderSlot />
          {children}
        </Providers>
      </body>
    </html>
  );
}
