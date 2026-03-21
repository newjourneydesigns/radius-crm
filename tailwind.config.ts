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
          darkest: '#091b34',
          dark:    '#0b2545',
          mid:     '#4c6785',
          light:   '#8da9c4',
          text:    '#eef4ed',
        },
      },
      backgroundImage: {
        'btn-primary':   'linear-gradient(135deg, #4c6785 0%, #8da9c4 100%)',
        'btn-secondary': 'linear-gradient(135deg, #0b2545 0%, #4c6785 100%)',
        'btn-success':   'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        'btn-danger':    'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        'brand-gradient':'linear-gradient(135deg, #091b34 0%, #0b2545 25%, #4c6785 75%, #8da9c4 100%)',
      },
      boxShadow: {
        'glow-brand': '0 0 0 1px rgba(141,169,196,0.25), 0 4px 16px rgba(76,103,133,0.2)',
        'glow-green': '0 0 0 1px rgba(34,197,94,0.25), 0 4px 16px rgba(34,197,94,0.15)',
        'glow-red':   '0 0 0 1px rgba(239,68,68,0.25), 0 4px 16px rgba(239,68,68,0.15)',
        'card-glass': '0 4px 24px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(255,255,255,0.06)',
      },
    },
  },
  plugins: [],
}
export default config
