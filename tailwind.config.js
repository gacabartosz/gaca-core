/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/frontend/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gray: {
          750: '#2d3748',
        },
      },
    },
  },
  plugins: [],
};
