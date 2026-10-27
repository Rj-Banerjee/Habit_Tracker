'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
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
    <article className="bg-[#fffdfa] border border-[#f1ebd8] rounded-2xl overflow-hidden shadow-xs flex flex-col h-full">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-amber-100/70 border-b border-amber-200/80">
        <span className="text-xs font-bold tracking-widest uppercase text-amber-900">
          MONTHLY REFLECTION
        </span>
        <Button
          onClick={onAutoGenerate}
          variant="secondary"
          size="sm"
          className="text-xs bg-white/80 hover:bg-white text-amber-900 border-amber-200 py-1"
          title="Synthesize monthly stats into a written review"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          <span>Auto-Generate Review</span>
        </Button>
      </div>

      {/* Body: Lined Paper & Companion Photo */}
      <div className="grid grid-cols-[1fr_210px] gap-4 p-4 flex-1">
        {/* Lined Journal Textarea */}
        <div className="relative w-full h-full min-h-[170px]">
          <textarea
            value={content}
            onChange={handleChange}
            placeholder="This month, I stayed consistent with my habits and noticed small details..."
            className="w-full h-full border-none bg-transparent outline-none resize-none font-serif italic text-sm text-slate-800 leading-[28px] p-1"
            style={{
              backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, #f1ebd8 28px)',
            }}
          />
        </div>

        {/* Companion Aesthetic Photo */}
        <div className="w-full h-full min-h-[170px] rounded-xl overflow-hidden bg-amber-50">
          <img
            src="https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?auto=format&fit=crop&w=700&q=80"
            alt="Mindful Reflection"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </article>
  );
};
