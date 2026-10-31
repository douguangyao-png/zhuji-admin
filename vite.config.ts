import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * 内容安全策略：只在构建产物里加（开发服务器要内联脚本做热更新）。
 * 只允许本站的脚本；样式允许内联（React 的 style 属性和图表要用）；图片允许 data: 和 blob:（验证码、截图、附件预览）。
 * 页面被谁嵌入（frame-ancestors）meta 里不生效，要在 nginx 响应头里设，见 docs/安全说明.md
 */
const CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
  "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');
const csp = () => ({
  name: 'csp-meta',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />`),
});

export default defineConfig({
  plugins: [react(), csp()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // 相对路径 + 哈希路由：产物可挂在任意路径下；chrome80 照顾内核较老的浏览器
  base: './',
  define: { __BUILD__: JSON.stringify(new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')) },
  build: { target: 'chrome80', chunkSizeWarningLimit: 2000 },
  server: { port: 3500 },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    globals: true,
    testTimeout: 20000,
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
} as never);
