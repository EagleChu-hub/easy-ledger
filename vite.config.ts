import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// base 對應 GitHub Pages 的 repo 路徑；本機 dev 不受影響
export default defineConfig({
  base: process.env.GH_PAGES ? '/easy-ledger/' : '/',
  build: { emptyOutDir: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '輕鬆記帳 easy-ledger',
        short_name: '輕鬆記帳',
        description: '資料只在你手機、零成本的收支記錄與 AI 分析',
        lang: 'zh-TW',
        theme_color: '#0e100f',
        background_color: '#0e100f',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
