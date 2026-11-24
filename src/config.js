// ===== 網站設定（唯一的設定檔） =====
// publishable key 本來就是設計給前端公開使用的；資料由資料庫的 Row Level Security 保護，
// 只有登入的本人能讀寫自己的資料。請勿把 service_role / secret key 放在這裡。
export const SUPABASE_URL = 'https://ogghvvfumnnavfbpzdfa.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YAvA1AiRXpDMYyJNrQqKzg_zHHPlvoF'
export const APP_NAME = '浩倫工作站'
