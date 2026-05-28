import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          darkest: '#0d0f12',
          dark:    '#161820',
          mid:     '#3d4351',
          light:   '#94a3b8',
          text:    '#f1f5f9',
        },
        vc: {
          50:  '#f0fbed',
          100: '#d9f5d2',
          200: '#b3eaa6',
          300: '#84db70',
          400: '#56c93f',
          500: '#33B233',
          600: '#2a9329',
          700: '#237821',
          800: '#1f5f1e',
          900: '#1b4e1b',
          950: '#0a2c0a',
        },
      },
      backgroundImage: {
        'btn-primary':   'linear-gradient(135deg, #3d4351 0%, #94a3b8 100%)',
        'btn-secondary': 'linear-gradient(135deg, #161820 0%, #3d4351 100%)',
        'btn-success':   'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        'btn-danger':    'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        'brand-gradient':'linear-gradient(135deg, #0d0f12 0%, #161820 35%, #3d4351 75%, #94a3b8 100%)',
        'vc-fab':        'linear-gradient(135deg, #2a9329 0%, #56c93f 100%)',
        'vc-submenu':    'linear-gradient(135deg, #161820 0%, #1f222c 100%)',
      },
      boxShadow: {
        'glow-brand': '0 0 0 1px rgba(148,163,184,0.2), 0 4px 16px rgba(61,67,81,0.25)',
        'glow-green': '0 0 0 1px rgba(34,197,94,0.25), 0 4px 16px rgba(34,197,94,0.15)',
        'glow-red':   '0 0 0 1px rgba(239,68,68,0.25), 0 4px 16px rgba(239,68,68,0.15)',
        'glow-vc':    '0 0 14px rgba(51,178,51,0.45), 0 2px 8px rgba(0,0,0,0.35)',
        'card-glass': '0 4px 24px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.05)',
      },
    },
  },
  plugins: [],
}
export default config
