import './global.css';

/** Root metadata for the GameForge Studio application */
export const metadata = {
  title: 'GameForge Studio',
  description:
    'AI-powered game creation platform — describe your game, watch it come to life.',
};

/**
 * Root layout wrapping all pages in the Studio app.
 * Provides the HTML shell with dark-mode body styling.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-900 text-slate-50">
        {children}
      </body>
    </html>
  );
}
