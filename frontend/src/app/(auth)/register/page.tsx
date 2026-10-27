import Link from 'next/link';
import { RegisterForm } from '../../../components/auth/RegisterForm';

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-[#fbfaf8] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <div className="text-center mb-6">
          <h1 className="font-serif italic text-3xl font-bold text-slate-800">
            Create an Account
          </h1>
          <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase mt-1">
            Start Your Mindful Consistency Journey
          </p>
        </div>

        <RegisterForm />

        <div className="text-center text-xs text-slate-500 mt-6 pt-4 border-t border-slate-100">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700">
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
