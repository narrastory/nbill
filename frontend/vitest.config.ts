import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/**
 * 单元测试配置。
 *
 * 与 vite.config.ts 分开：构建配置里不需要 tailwind 之外的测试设置，
 * 而测试也不需要 dev proxy 与产物体积相关的配置，分开更好读。
 *
 * 不使用 `globals: true`：统一从 'vitest' 显式 import，
 * 这样 tsconfig.app.json 无需额外声明全局类型，类型来源也更清楚。
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts'],
  },
})
