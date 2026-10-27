/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
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
