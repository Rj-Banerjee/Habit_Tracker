'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { Skeleton } from '../ui/Skeleton';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fbfaf8] p-8 flex flex-col gap-6 max-w-[1540px] mx-auto">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
};
