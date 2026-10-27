'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { contentService } from '../../services/contentService';
import { DailyQuoteData } from '../../types';

export const MotivationalCard: React.FC = () => {
  const [quoteData, setQuoteData] = useState<DailyQuoteData>({
    date: new Date().toISOString().split('T')[0],
    quote: 'Focused, intentional, and ready for the month ahead.',
    author: 'Mindful Living',
    imageUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=700&q=80',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    contentService
      .getDailyQuote()
      .then((data: DailyQuoteData) => {
        if (data && data.quote) setQuoteData(data);
      })
      .catch(() => {
        // fallback to default
      });
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const fresh = await contentService.refreshDailyQuote();
      if (fresh) setQuoteData(fresh);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between h-full transition-colors duration-200">
      {/* Framed Image */}
      <div className="w-full h-48 sm:h-52 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 relative group shadow-xs">
        <img
          src={quoteData.imageUrl}
          alt={quoteData.author}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60" />
      </div>

      {/* Quote Text */}
      <div className="py-4 flex flex-col justify-center flex-1 text-center">
        <span className="font-serif italic text-xs text-slate-400 dark:text-slate-500">I am ...</span>
        <p className="font-serif italic text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 leading-snug mt-1">
          &ldquo;{quoteData.quote}&rdquo;
        </p>
        <span className="text-[11px] font-bold tracking-widest uppercase text-slate-400 dark:text-slate-500 mt-2">
          {quoteData.author}
        </span>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
        <span>Daily Inspiration ☀️</span>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1 font-medium transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>{loading ? 'Refreshing...' : 'Next Quote →'}</span>
        </button>
      </div>
    </article>
  );
};
