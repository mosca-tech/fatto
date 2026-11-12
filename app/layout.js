import './globals.css';

export const metadata = {
  title: 'Fatto',
  description: 'Bacheca personale dei task di lavoro e vita privata',
  appleWebApp: { capable: true, title: 'Fatto', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
