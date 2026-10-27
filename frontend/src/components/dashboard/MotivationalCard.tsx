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
        // use default fallback
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
    <article className="flex flex-col justify-between p-3.5 bg-amber-50/20 border border-amber-200/50 rounded-2xl shadow-xs text-center h-full">
      {/* Framed Image */}
      <div className="w-full h-56 rounded-xl overflow-hidden bg-slate-100 shadow-inner relative group">
        <img
          src={quoteData.imageUrl}
          alt={quoteData.author}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      </div>

      {/* Quote Text */}
      <div className="py-3 px-1 flex flex-col justify-center flex-1">
        <span className="font-serif italic text-xs text-slate-500">I am ...</span>
        <p className="font-serif italic text-base font-semibold text-slate-800 leading-snug mt-1">
          &ldquo;{quoteData.quote}&rdquo;
        </p>
        <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mt-2">
          {quoteData.author}
        </span>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between pt-2 border-t border-amber-200/30 text-[10px] text-slate-400">
        <span>Fresh inspiration daily ☀️</span>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 font-medium underline disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className="w-3 h-3 text-amber-500" />
          <span>{loading ? 'Refreshing...' : 'Next Quote →'}</span>
        </button>
      </div>
    </article>
  );
};
