import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const inputId = id || props.name || Math.random().toString(36).substring(2, 9);

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-slate-700">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={twMerge(
            clsx(
              'px-3 py-1.5 text-sm bg-white border rounded-md outline-none transition-all text-slate-900 placeholder:text-slate-400',
              error
                ? 'border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100'
                : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
              className
            )
          )}
          {...props}
        />
        {error && <span className="text-xs text-rose-500">{error}</span>}
        {helperText && !error && <span className="text-xs text-slate-500">{helperText}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
