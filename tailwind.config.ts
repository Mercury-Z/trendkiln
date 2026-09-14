import type { Config } from 'tailwindcss'

// Mirrors the original site's Tailwind setup: default palette, content scanned
// from the app directory, no plugins. All custom component classes live in
// assets/css/main.css.
export default {
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.{js,ts}',
    './plugins/**/*.{js,ts}',
    './app.vue',
    './error.vue',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
