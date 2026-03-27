/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        ink: '#1A1410',
        sand: '#F6F1E8',
        clay: '#DFA66F',
        pine: '#145D4A',
        mist: '#D9E8E3'
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['Manrope', 'sans-serif']
      },
      boxShadow: {
        card: '0 12px 35px rgba(26, 20, 16, 0.12)'
      }
    }
  },
  plugins: []
};
