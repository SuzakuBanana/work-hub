import { sb } from '../supabase.js'
import { esc, modal, handleErr, toast, copyText, debounce, parseTags, confirmBox } from '../utils.js'

const CATS = ['案由', '致詞稿', '其他']
const st = { cat: '全部', q: '', sel: null }

export async function renderTemplates(view) {
  let items = []
  view.classList.add('full')
  view.innerHTML = `<div class="tpl">
    <aside class="tpl-list"><div class="tree-head"><b>📚 範本庫</b><button class="btn primary sm" data-new>＋ 新範本</button></div>
      <input class="search" type="search" placeholder="搜尋標題、內容、標籤" value="${esc(st.q)}">
      <div class="chips">${['全部', ...CATS].map((c) => `<button class="chip" data-c="${c}">${c}</button>`).join('')}</div>
      <div class="tpl-items"></div></aside>
    <section class="tpl-detail"><div class="empty">選一個範本，或新增一個。<br><small>小技巧：內文可放 {{日期}}、{{活動名稱}} 這類變數，複製時會讓你填入。</small></div></section></div>`
  const listEl = view.querySelector('.tpl-items'), det = view.querySelector('.tpl-detail')
  view.querySelector('.search').oninput = (e) => { st.q = e.target.value; drawList() }
  view.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { st.cat = b.dataset.c; drawList() }))
  view.querySelector('[data-new]').onclick = async () => {
    const { data, error } = await sb.from('templates').insert({ category: st.cat === '全部' ? '其他' : st.cat, title: '新範本', body: '' }).select().single()
    if (handleErr(error, '新增失敗')) return
    items.unshift(data); st.sel = data.id; drawList(); drawDetail(); det.querySelector('[name=title]')?.select()
  }
  const { data, error } = await sb.from('templates').select('*').order('updated_at', { ascending: false })
  if (handleErr(error, '讀取範本失敗')) return
  items = data
  drawList()
  if (st.sel && items.some((t) => t.id === st.sel)) drawDetail()

  const save = debounce(async (t) => {
    const { error } = await sb.from('templates').update({ title: t.title, category: t.category, body: t.body, tags: t.tags }).eq('id', t.id)
    const s = det.querySelector('.save-status')
    if (handleErr(error, '儲存失敗')) { if (s) s.textContent = '⚠ 未儲存'; return }
    if (s) s.textContent = '✓ 已儲存'
  }, 700)

  function filtered() {
    const q = st.q.trim().toLowerCase()
    return items.filter((t) => (st.cat === '全部' || t.category === st.cat) && (!q || `${t.title} ${t.body} ${t.tags.join(' ')}`.toLowerCase().includes(q)))
  }
  function drawList() {
    view.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('active', b.dataset.c === st.cat))
    const v = filtered()
    listEl.innerHTML = v.map((t) => `<div class="tpl-item ${t.id === st.sel ? 'active' : ''}" data-id="${t.id}">
      <div class="row"><span class="pill c-${t.category}">${t.category}</span><b>${esc(t.title || '未命名')}</b></div>
      <div class="small muted clamp">${esc(t.body.slice(0, 80)) || '（空白）'}</div>
      <div class="row"><span>${t.tags.map((g) => `<span class="tag">#${esc(g)}</span>`).join('')}</span><button class="btn sm" data-copy>複製</button></div></div>`).join('') || '<p class="muted small">沒有符合的範本</p>'
    listEl.querySelectorAll('.tpl-item').forEach((el) => {
      const t = items.find((x) => x.id === el.dataset.id)
      el.onclick = (e) => { if (e.target.closest('[data-copy]')) { e.stopPropagation(); doCopy(t); return } save.flush(t); st.sel = t.id; drawList(); drawDetail() }
    })
  }
  function drawDetail() {
    const t = items.find((x) => x.id === st.sel)
    if (!t) { det.innerHTML = '<div class="empty">選一個範本，或新增一個。</div>'; return }
    view.querySelector('.tpl').classList.add('has-sel')
    det.innerHTML = `<div class="ed-top"><button class="btn ghost sm back" data-back>← 範本列表</button><span class="save-status small muted">✓ 已儲存</span><span class="spacer"></span>
      <button class="btn ghost sm danger-text" data-del>刪除</button><button class="btn primary" data-copy>📋 複製內文</button></div>
      <div class="tpl-form"><input class="title-input" name="title" value="${esc(t.title)}" placeholder="範本標題">
      <div class="grid2"><label>分類<select name="category">${CATS.map((c) => `<option ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>標籤（逗號分隔）<input name="tags" value="${esc(t.tags.join(', '))}"></label></div>
      <label>內文<textarea name="body" rows="18" placeholder="輸入範本內容。可用 {{變數}} 當作要替換的地方。">${esc(t.body)}</textarea></label>
      <div class="small muted"><span data-count></span></div></div>`
    const count = () => (det.querySelector('[data-count]').textContent = `${t.body.replace(/\s/g, '').length} 字（不含空白）・約可講 ${Math.max(1, Math.round(t.body.replace(/\s/g, '').length / 220))} 分鐘`)
    count()
    det.querySelectorAll('[name]').forEach((el) => (el.oninput = () => {
      const k = el.name
      t[k] = k === 'tags' ? parseTags(el.value) : el.value
      det.querySelector('.save-status').textContent = '儲存中…'
      if (k === 'body') count()
      save(t); drawList()
    }))
    det.querySelector('[data-copy]').onclick = () => doCopy(t)
    det.querySelector('[data-back]').onclick = () => view.querySelector('.tpl').classList.remove('has-sel')
    det.querySelector('[data-del]').onclick = async () => {
      if (!confirmBox(`確定刪除範本「${t.title}」？`)) return
      const { error } = await sb.from('templates').delete().eq('id', t.id)
      if (handleErr(error, '刪除失敗')) return
      items = items.filter((x) => x !== t); st.sel = null; drawList(); drawDetail(); view.querySelector('.tpl').classList.remove('has-sel')
    }
  }
  function doCopy(t) {
    const vars = [...new Set([...t.body.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]))]
    if (!vars.length) { copyText(t.body); return }
    const m = modal({
      title: '填入變數後複製',
      body: vars.map((v, i) => `<label>${esc(v)}<input data-v="${i}" placeholder="留空則保留 {{${esc(v)}}}"></label>`).join(''),
      actions: `<span class="spacer"></span><button class="btn" data-raw>直接複製原文</button><button class="btn primary" data-ok>複製</button>`,
    })
    m.el.querySelector('[data-raw]').onclick = () => { copyText(t.body); m.close() }
    m.el.querySelector('[data-ok]').onclick = () => {
      let out = t.body
      vars.forEach((v, i) => { const val = m.el.querySelector(`[data-v="${i}"]`).value; if (val) out = out.replace(new RegExp(`\\{\\{\\s*${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g'), val) })
      copyText(out); m.close()
    }
  }
  return () => { const t = items.find((x) => x.id === st.sel); if (t) save.flush(t); view.classList.remove('full') }
}
