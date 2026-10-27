/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/utils/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'bg-blue-600', 'border-blue-600', 'text-blue-600', 'bg-blue-50', 'text-blue-700', 'border-blue-200', 'dark:bg-blue-950/40', 'dark:text-blue-400',
    'bg-pink-600', 'border-pink-600', 'text-pink-600', 'bg-pink-50', 'text-pink-700', 'border-pink-200', 'dark:bg-pink-950/40', 'dark:text-pink-400',
    'bg-teal-600', 'border-teal-600', 'text-teal-600', 'bg-teal-50', 'text-teal-700', 'border-teal-200', 'dark:bg-teal-950/40', 'dark:text-teal-400',
    'bg-amber-600', 'border-amber-600', 'text-amber-600', 'bg-amber-50', 'text-amber-700', 'border-amber-200', 'dark:bg-amber-950/40', 'dark:text-amber-400',
    'bg-indigo-600', 'border-indigo-600', 'text-indigo-600', 'bg-indigo-50', 'text-indigo-700', 'border-indigo-200', 'dark:bg-indigo-950/40', 'dark:text-indigo-400',
  ],
  theme: {
    extend: {
      colors: {
        pastel: {
          bg: '#fbfaf8',
          card: '#ffffff',
          w1: {
            DEFAULT: '#93c5fd',
            light: '#eff6ff',
            border: '#60a5fa',
            dark: '#1e40af',
          },
          w2: {
            DEFAULT: '#f9a8d4',
            light: '#fdf2f8',
            border: '#f472b6',
            dark: '#be185d',
          },
          w3: {
            DEFAULT: '#99f6e4',
            light: '#f0fdfa',
            border: '#2dd4bf',
            dark: '#0f766e',
          },
          w4: {
            DEFAULT: '#fde68a',
            light: '#fefce8',
            border: '#fbbf24',
            dark: '#b45309',
          },
          w5: {
            DEFAULT: '#bfdbfe',
            light: '#eff6ff',
            border: '#93c5fd',
            dark: '#1e40af',
          },
          cream: '#fffdfa',
          line: '#f1ebd8',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Playfair Display', 'Cormorant Garamond', 'Georgia', 'serif'],
      },
      boxShadow: {
        'card-light': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
