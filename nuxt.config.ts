// Nuxt config for the Trendkiln replica.
// The original site is a Nuxt 3 app (Tailwind v3 + @nuxtjs/i18n, no_prefix, zh default)
// served by an SSR runtime on Cloudflare Pages. We keep that stack and additionally
// support a fully prerendered build so it can be hosted on free static hosting.
const baseURL = process.env.NUXT_APP_BASE_URL || '/'

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  ssr: true,

  app: {
    baseURL,
    head: {
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      // The original ships favicon.ico at the site root and relies on the
      // browser's implicit lookup. A project page is served from a sub-path, so
      // the icon is declared explicitly to keep the same behaviour.
      link: [{ rel: 'icon', href: `${baseURL}favicon.ico` }],
    },
  },

  modules: ['@nuxtjs/tailwindcss', '@nuxtjs/i18n'],

  tailwindcss: {
    cssPath: '~/assets/css/main.css',
    configPath: 'tailwind.config.ts',
    exposeConfig: false,
    viewer: false,
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'zh',
    // The original keeps locale detection off: SSR always renders the default
    // locale and the switch happens on the client only.
    detectBrowserLanguage: false,
    baseUrl: baseURL,
    locales: [
      { code: 'zh', language: 'zh-CN', name: '中文', file: 'zh.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
    bundle: { optimizeMessageBundling: true },
  },

  nitro: {
    // Static-first: every route (and the demo API) is prerenderable, so the whole
    // site can be shipped to free static hosting such as GitHub Pages.
    prerender: {
      crawlLinks: true,
      routes: ['/', '/github', '/models', '/feed', '/watchlist', '/settings', '/404.html'],
    },
  },

  typescript: { strict: false, typeCheck: false },

  devtools: { enabled: false },

  ignore: ['_tools/**', '_recon/**'],
})
