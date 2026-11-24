import { defineConfig } from 'vite'
// GitHub Pages 網址為 https://suzakubanana.github.io/work-hub/
// 網站使用 #/ 路由，重新整理不會 404；base 設為 /work-hub/ 對應 Pages 子路徑。
export default defineConfig({ base: process.env.VITE_BASE || '/work-hub/' })
