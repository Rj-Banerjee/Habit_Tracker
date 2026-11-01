'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@habit-tracker/ui';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabase';

export default function LoginPage() {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session) router.replace('/');
  }, [session, router]);

  return <AuthForm auth={supabase.auth} />;
}
