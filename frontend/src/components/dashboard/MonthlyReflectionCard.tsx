'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, BookOpen } from 'lucide-react';
import { Button } from '../ui/Button';

interface MonthlyReflectionCardProps {
  initialContent?: string;
  onSave: (content: string) => void;
  onAutoGenerate: () => void;
}

export const MonthlyReflectionCard: React.FC<MonthlyReflectionCardProps> = ({
  initialContent = '',
  onSave,
  onAutoGenerate,
}) => {
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    onSave(val);
  };

  return (
    <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between h-full transition-colors duration-200">
      <div>
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-sm tracking-wide text-slate-900 dark:text-white uppercase">
              Monthly Reflection
            </h3>
          </div>
          <Button
            onClick={onAutoGenerate}
            variant="secondary"
            size="sm"
            className="text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/80 hover:bg-amber-100 dark:hover:bg-amber-900/50 py-1"
            title="Synthesize monthly stats into a written review"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Auto-Generate</span>
          </Button>
        </div>

        {/* Body: Lined Paper & Companion Photo */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
          {/* Lined Journal Textarea */}
          <div className="relative w-full min-h-[180px]">
            <textarea
              value={content}
              onChange={handleChange}
              placeholder="Reflect on your intentions, wins, and learnings for this month..."
              className="w-full h-full min-h-[180px] border-none bg-transparent outline-none resize-none font-serif italic text-sm text-slate-800 dark:text-slate-200 leading-[28px] p-1"
              style={{
                backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, rgba(148, 163, 184, 0.2) 28px)',
              }}
            />
          </div>

          {/* Companion Photo */}
          <div className="hidden sm:block w-full h-full min-h-[180px] rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
            <img
              src="https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?auto=format&fit=crop&w=700&q=80"
              alt="Mindful Reflection"
              className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
            />
          </div>
        </div>
      </div>
    </article>
  );
};
