import './style.css'
import { sb } from './supabase.js'
import { APP_NAME } from './config.js'
import { esc, h, toast } from './utils.js'
import { renderTasks } from './views/tasks.js'
import { renderNotes } from './views/notes.js'
import { renderBureau } from './views/bureau.js'
import { renderTemplates } from './views/templates.js'
import { renderCalendar } from './views/calendar.js'

const app = document.getElementById('app')
const SECTIONS = [
  { key: 'tasks', label: '待辦', icon: '✅', render: renderTasks },
  { key: 'notes', label: '筆記', icon: '📝', render: renderNotes },
  { key: 'bureau', label: '局處彙整', icon: '📊', render: renderBureau },
  { key: 'templates', label: '範本庫', icon: '📚', render: renderTemplates },
  { key: 'calendar', label: '行事曆', icon: '📅', render: renderCalendar },
]
let session = null
let cleanup = null

function renderLogin() {
  cleanup?.(); cleanup = null
  app.innerHTML = ''
  const el = h(`<div class="login-wrap"><form class="login-card" autocomplete="on">
    <div class="brand big">🌿 ${esc(APP_NAME)}</div>
    <p class="muted">個人工作網站・資料安全存放在雲端</p>
    <div class="tabs"><button type="button" class="tab active" data-mode="in">登入</button><button type="button" class="tab" data-mode="up">註冊</button></div>
    <label>Email<input name="email" type="email" required placeholder="you@example.com" autocomplete="email"></label>
    <label class="pw">密碼<input name="password" type="password" minlength="6" placeholder="至少 6 碼" autocomplete="current-password"></label>
    <button class="btn primary block" type="submit">登入</button>
    <button class="btn ghost block" type="button" data-magic>改用 Email 登入連結（免密碼）</button>
    <p class="msg muted"></p></form></div>`)
  app.append(el)
  let mode = 'in'
  const form = el.querySelector('form'), msg = el.querySelector('.msg'), submit = form.querySelector('[type=submit]')
  el.querySelectorAll('.tab').forEach((t) => (t.onclick = () => {
    mode = t.dataset.mode
    el.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t))
    submit.textContent = mode === 'in' ? '登入' : '建立帳號'
    form.password.autocomplete = mode === 'in' ? 'current-password' : 'new-password'
    msg.textContent = ''
  }))
  form.onsubmit = async (e) => {
    e.preventDefault()
    const email = form.email.value.trim(), password = form.password.value
    if (password.length < 6) { msg.textContent = '密碼至少 6 碼'; return }
    submit.disabled = true; msg.textContent = '處理中…'
    const redirect = location.origin + location.pathname
    const { data, error } = mode === 'in'
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
    submit.disabled = false
    if (error) { msg.textContent = '失敗：' + translateAuthErr(error.message); return }
    if (mode === 'up' && !data.session) msg.textContent = '帳號已建立！請到信箱點「確認連結」後再回來登入。'
  }
  el.querySelector('[data-magic]').onclick = async () => {
    const email = form.email.value.trim()
    if (!email) { msg.textContent = '請先輸入 Email'; form.email.focus(); return }
    msg.textContent = '寄送中…'
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } })
    msg.textContent = error ? '失敗：' + translateAuthErr(error.message) : '登入連結已寄出，請到信箱點擊連結。'
  }
}

function translateAuthErr(m) {
  if (/Invalid login credentials/i.test(m)) return 'Email 或密碼錯誤'
  if (/Email not confirmed/i.test(m)) return 'Email 尚未確認，請先到信箱點確認連結'
  if (/already registered/i.test(m)) return '這個 Email 已經註冊過，請直接登入'
  if (/rate limit/i.test(m)) return '寄信次數太頻繁，請稍後再試'
  return m
}

function renderShell() {
  app.innerHTML = ''
  const nav = SECTIONS.map((s) => `<a href="#/${s.key}" data-key="${s.key}" class="nav-item"><span class="ni">${s.icon}</span><span class="nl">${s.label}</span></a>`).join('')
  const shell = h(`<div class="shell">
    <aside class="sidebar">
      <div class="brand">🌿 <span>${esc(APP_NAME)}</span></div>
      <nav>${nav}</nav>
      <div class="side-foot"><div class="user muted" title="${esc(session.user.email)}">${esc(session.user.email)}</div>
      <button class="btn ghost sm" data-logout>登出</button></div>
    </aside>
    <main class="main" id="view"></main></div>`)
  app.append(shell)
  shell.querySelector('[data-logout]').onclick = async () => { await sb.auth.signOut() }
  route()
}

function route() {
  if (!session) return
  const key = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'tasks'
  const sec = SECTIONS.find((s) => s.key === key) || SECTIONS[0]
  document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.key === sec.key))
  const view = document.getElementById('view')
  if (!view) return
  cleanup?.(); cleanup = null
  view.innerHTML = ''
  view.scrollTop = 0
  document.title = `${sec.label}｜${APP_NAME}`
  Promise.resolve(sec.render(view, { user: session.user, params: location.hash.split('/').slice(2) }))
    .then((c) => { cleanup = typeof c === 'function' ? c : null })
    .catch((e) => { console.error(e); toast('載入失敗：' + e.message, 'error') })
}

window.addEventListener('hashchange', () => {
  const key = (location.hash.match(/^#\/(\w+)/) || [])[1]
  const current = document.querySelector('.nav-item.active')?.dataset.key
  if (key && key === current && location.hash.split('/').length > 2) return // 同區塊內的子路由由各頁自己處理
  route()
})

let shown = null // 'login' | 'shell'
sb.auth.onAuthStateChange((_ev, s) => {
  session = s
  setTimeout(() => {
    if (s && shown !== 'shell') { shown = 'shell'; renderShell() }
    else if (!s && shown !== 'login') { shown = 'login'; renderLogin() }
  }, 0)
})
