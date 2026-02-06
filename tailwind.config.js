/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./static/**/*.{html,js}",
    "./src/**/*.{html,js}"
  ],
  darkMode: 'class',
  // Safelist classes that are constructed dynamically (e.g., `${breakpoint}:block`)
  safelist: [
    '2xl:block', '2xl:hidden', '2xl:flex',
    'lg:block', 'lg:hidden', 'lg:flex',
    'xl:block', 'xl:hidden', 'xl:flex',
    'md:block', 'md:hidden', 'md:flex',
    'sm:block', 'sm:hidden', 'sm:flex',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
