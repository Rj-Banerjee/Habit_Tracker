import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div
      className={twMerge(
        clsx('animate-pulse bg-slate-200/80 rounded-md', className)
      )}
    />
  );
};
