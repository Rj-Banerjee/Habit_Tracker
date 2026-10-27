import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../hooks/useAuth';
import { ToastProvider } from '../hooks/useToast';

export const metadata: Metadata = {
  title: 'Aesthetic Monthly Habit Tracker | Enterprise Dashboard',
  description: 'Enterprise full-stack habit tracking dashboard with Supabase, Next.js, and Express',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
