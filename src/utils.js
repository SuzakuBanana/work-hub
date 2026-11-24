export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function h(html) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild
}

export function debounce(fn, ms = 600) {
  let t
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
  d.flush = (...a) => { clearTimeout(t); fn(...a) }
  return d
}

export function toast(msg, type = 'info') {
  let box = document.getElementById('toasts')
  if (!box) { box = h('<div id="toasts"></div>'); document.body.append(box) }
  const el = h(`<div class="toast ${type}">${esc(msg)}</div>`)
  box.append(el)
  setTimeout(() => el.classList.add('out'), 2600)
  setTimeout(() => el.remove(), 3000)
}

export function handleErr(error, msg = '操作失敗') {
  if (error) { console.warn(error); toast(`${msg}：${error.message || error}`, 'error'); return true }
  return false
}

export const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${ymd(d)}T${hm(d)}` }
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)
export const fmtDate = (s) => { if (!s) return ''; const d = new Date(s.length === 10 ? s + 'T00:00' : s); return `${d.getMonth() + 1}/${d.getDate()}` }
export const WEEK = ['日', '一', '二', '三', '四', '五', '六']
export const parseTags = (s) => String(s || '').split(/[,，、\s]+/).map((x) => x.trim()).filter(Boolean)

/** 簡易對話框：fields 由呼叫者提供 HTML，回傳 { el, close } */
export function modal({ title, body, actions = '' , onMount }) {
  const el = h(`<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="關閉">✕</button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot">${actions}</div></div></div>`)
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey) }
  const onKey = (e) => { if (e.key === 'Escape') close() }
  el.addEventListener('mousedown', (e) => { if (e.target === el) close() })
  el.querySelector('[data-close]').onclick = close
  document.addEventListener('keydown', onKey)
  document.body.append(el)
  onMount?.(el)
  el.querySelector('input,textarea,select')?.focus()
  return { el, close }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text) }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select()
    document.execCommand('copy'); ta.remove()
  }
  toast('已複製到剪貼簿', 'success')
}

export function confirmBox(msg) { return window.confirm(msg) }
