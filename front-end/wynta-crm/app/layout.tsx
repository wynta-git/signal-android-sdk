import 'wynta-react-common/app/globals.css';
import './globals.css';
import Providers from './providers';
import DjHeaderSlotWrapper from '../components/DjHeaderSlotWrapper';

export const metadata = {
  title: 'Wynta CRM',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script src="https://code.jquery.com/jquery-1.12.4.min.js"></script>
        <Providers>
          <DjHeaderSlotWrapper />
          {children}
        </Providers>
      </body>
    </html>
  );
}
