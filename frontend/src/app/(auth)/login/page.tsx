import Link from 'next/link';
import { LoginForm } from '../../../components/auth/LoginForm';

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#fbfaf8] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <div className="text-center mb-6">
          <h1 className="font-serif italic text-3xl font-bold text-slate-800">
            Welcome Back
          </h1>
          <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase mt-1">
            Habit Tracker Dashboard
          </p>
        </div>

        <LoginForm />

        <div className="text-center text-xs text-slate-500 mt-6 pt-4 border-t border-slate-100">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-semibold text-blue-600 hover:text-blue-700">
            Create an account
          </Link>
        </div>
      </div>
    </main>
  );
}
