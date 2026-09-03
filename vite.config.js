import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  /** 开发：局域网用 http://本机IP:5173 访问须监听 0.0.0.0（与 npm run dev 的 --host 一致） */
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  /**
   * 预览（npm run build && npm run preview）：默认只绑 localhost，
   * 用局域网 IP 或另一台设备访问会打不开或一直加载；与 dev 同样开启 host。
   */
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
  },
})
