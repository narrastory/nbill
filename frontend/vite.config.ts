import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 后端真实地址只用于开发代理，前端代码永远通过 VITE_API_BASE_URL 访问。
  const backendOrigin = env.VITE_BACKEND_ORIGIN || 'http://localhost:9081'
  const apiBaseUrl = env.VITE_API_BASE_URL || '/api'

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      // 仅当 baseURL 是相对路径时才需要代理；相对路径可完全避开 CORS。
      proxy: apiBaseUrl.startsWith('/')
        ? {
            [apiBaseUrl]: {
              target: backendOrigin,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    /**
     * 关于产物体积：这里刻意**不做** vendor 分包。
     *
     * 实测（rolldown advancedChunks 拆 echarts / element-plus / vue 三个 vendor）：
     *   拆分前首屏 JS 1051.6 KB，拆分后 1047.9 KB —— 只差 0.35%。
     * 分包只改变代码的分布，不会减少总字节；缓存收益对本地单人应用也无意义。
     *
     * 真正的大头是 Element Plus 的全量注册（首屏 959 KB 中约 900 KB）。
     * 要显著下降需要改成按需引入（unplugin-vue-components +
     * ElementPlusResolver），但那会让 Element Plus 的 CSS 变成**未分层**样式，
     * 从而压过 Tailwind 的分层工具类 —— 即 src/styles/main.css 里
     * 精心调整过的层叠顺序会被打破。收益大但风险也大，属于独立任务，
     * 需要在改完后逐页做视觉回归。
     */
  }
})
