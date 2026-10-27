import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../hooks/useAuth';
import { ToastProvider } from '../hooks/useToast';
import { ThemeProvider } from '../hooks/useTheme';

export const metadata: Metadata = {
  title: 'Aesthetic Monthly Habit Tracker | Enterprise Dashboard',
  description: 'Modern, card-based habit tracking dashboard with Supabase, Next.js, and Express',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen">
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
