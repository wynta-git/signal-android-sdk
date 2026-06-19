import './globals.css';

export const metadata = {
  title: 'Bonus Client Test',
  description: 'S2S test client for the PAM bonus service player APIs',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
