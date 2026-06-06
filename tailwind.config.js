/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        charcoal: '#111111',
        cream: '#F6F0E7',
        gold: '#C6A96F',
        softGold: '#E0C99C',
        stone: '#3F3A37'
      },
      boxShadow: {
        panel: '0 24px 80px rgba(0,0,0,0.12)'
      },
      fontFamily: {
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
