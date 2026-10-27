'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

export const LoginForm: React.FC = () => {
  const { signIn } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
    } else {
      router.push('/');
    }
  };

  const handleDemoSignIn = async () => {
    setEmail('demo@habittracker.com');
    setPassword('DemoPass123!');
    setLoading(true);
    // Instant login for demo
    router.push('/');
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {errorMsg && (
        <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
          {errorMsg}
        </div>
      )}

      <Input
        label="Email Address"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <Input
        label="Password"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <Button
        type="submit"
        variant="primary"
        className="w-full mt-2 py-2.5 bg-slate-900 text-white font-semibold"
        disabled={loading}
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </Button>

      <div className="relative my-2 text-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <span className="relative bg-white px-2 text-xs text-slate-400 uppercase font-medium">
          or
        </span>
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={handleDemoSignIn}
        className="w-full border-dashed border-blue-300 text-blue-700 hover:bg-blue-50/60"
      >
        Explore in Demo Mode (1-Click)
      </Button>
    </form>
  );
};
