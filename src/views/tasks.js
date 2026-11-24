import { sb } from '../supabase.js'
import { esc, h, modal, handleErr, toast, fmtDate, ymd, parseTags, confirmBox } from '../utils.js'

const STATUSES = ['待辦', '進行中', '完成']
const PRIORITIES = ['高', '中', '低']
let state = { mode: localStorage.getItem('tasks.mode') || 'list', filter: '全部', q: '', items: [] }

export async function renderTasks(view) {
  view.innerHTML = `<header class="page-head"><h1>✅ 待辦與進度</h1>
    <div class="seg"><button data-mode="list">清單</button><button data-mode="kanban">看板</button></div></header>
    <form class="quick-add"><input name="t" placeholder="新增待辦，按 Enter 送出…（可在後面加 #標籤）" autocomplete="off"><button class="btn primary">新增</button></form>
    <div class="toolbar"><div class="chips" data-filter></div><input class="search" type="search" placeholder="搜尋待辦" value="${esc(state.q)}"></div>
    <div class="stats"></div><div id="task-body"></div>`
  view.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { state.mode = b.dataset.mode; localStorage.setItem('tasks.mode', state.mode); draw() }))
  view.querySelector('.search').oninput = (e) => { state.q = e.target.value; draw() }
  view.querySelector('.quick-add').onsubmit = async (e) => {
    e.preventDefault()
    const raw = e.target.t.value.trim(); if (!raw) return
    const tags = [...raw.matchAll(/#(\S+)/g)].map((m) => m[1])
    const title = raw.replace(/#\S+/g, '').trim() || raw
    const { data, error } = await sb.from('tasks').insert({ title, tags }).select().single()
    if (handleErr(error, '新增失敗')) return
    state.items.unshift(data); e.target.t.value = ''; draw()
  }
  const { data, error } = await sb.from('tasks').select('*').order('created_at', { ascending: false })
  if (handleErr(error, '讀取待辦失敗')) return
  state.items = data
  draw()

  function filtered() {
    const q = state.q.trim().toLowerCase()
    return state.items.filter((t) => (state.filter === '全部' || t.status === state.filter) &&
      (!q || (t.title + ' ' + (t.description || '') + ' ' + t.tags.join(' ')).toLowerCase().includes(q)))
  }
  function sortTasks(arr) {
    const pr = { 高: 0, 中: 1, 低: 2 }
    return [...arr].sort((a, b) => (a.status === '完成') - (b.status === '完成') ||
      (a.due_date || '9999') .localeCompare(b.due_date || '9999') || pr[a.priority] - pr[b.priority])
  }

  function draw() {
    view.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === state.mode))
    const chips = view.querySelector('[data-filter]')
    chips.innerHTML = ['全部', ...STATUSES].map((s) => `<button class="chip ${state.filter === s ? 'active' : ''}" data-s="${s}">${s} <small>${s === '全部' ? state.items.length : state.items.filter((t) => t.status === s).length}</small></button>`).join('')
    chips.querySelectorAll('.chip').forEach((c) => (c.onclick = () => { state.filter = c.dataset.s; draw() }))
    chips.style.display = state.mode === 'kanban' ? 'none' : ''
    const total = state.items.length, done = state.items.filter((t) => t.status === '完成').length
    const avg = total ? Math.round(state.items.reduce((s, t) => s + t.progress, 0) / total) : 0
    const today = ymd(new Date())
    const overdue = state.items.filter((t) => t.status !== '完成' && t.due_date && t.due_date < today).length
    view.querySelector('.stats').innerHTML = `<div class="stat"><b>${total}</b><span>全部</span></div><div class="stat"><b>${done}</b><span>已完成</span></div>
      <div class="stat ${overdue ? 'warn' : ''}"><b>${overdue}</b><span>已逾期</span></div><div class="stat wide"><span>整體進度 ${avg}%</span><div class="bar"><i style="width:${avg}%"></i></div></div>`
    const body = view.querySelector('#task-body')
    const items = sortTasks(filtered())
    if (state.mode === 'list') {
      body.innerHTML = items.length ? `<div class="task-list">${items.map(row).join('')}</div>` : empty()
    } else {
      body.innerHTML = `<div class="kanban">${STATUSES.map((s) => {
        const col = sortTasks(state.items.filter((t) => t.status === s && (!state.q || filtered().includes(t))))
        return `<section class="kcol" data-status="${s}"><h3>${s} <small>${col.length}</small></h3><div class="kdrop">${col.map(card).join('') || '<p class="muted small center">拖曳卡片到這裡</p>'}</div></section>`
      }).join('')}</div>`
      setupDnD(body)
    }
    body.querySelectorAll('[data-id]').forEach((el) => {
      const t = state.items.find((x) => x.id === el.dataset.id)
      el.querySelector('.t-check')?.addEventListener('click', (e) => { e.stopPropagation(); update(t, { status: t.status === '完成' ? '待辦' : '完成', progress: t.status === '完成' ? t.progress : 100 }) })
      el.addEventListener('click', (e) => { if (!e.target.closest('.t-check')) edit(t) })
    })
  }

  function empty() { return `<div class="empty">🎉 沒有符合的待辦。上面輸入框可以快速新增。</div>` }
  function due(t) {
    if (!t.due_date) return ''
    const late = t.status !== '完成' && t.due_date < ymd(new Date())
    return `<span class="due ${late ? 'late' : ''}">📅 ${fmtDate(t.due_date)}${late ? ' 逾期' : ''}</span>`
  }
  function tags(t) { return t.tags.map((g) => `<span class="tag">#${esc(g)}</span>`).join('') }
  function row(t) {
    return `<div class="task-row ${t.status === '完成' ? 'done' : ''}" data-id="${t.id}">
      <button class="t-check" aria-label="完成切換">${t.status === '完成' ? '✔' : ''}</button>
      <div class="t-main"><div class="t-title">${esc(t.title)}</div><div class="t-meta"><span class="pill s-${t.status}">${t.status}</span><span class="pri p-${t.priority}">${t.priority}</span>${due(t)}${tags(t)}</div></div>
      <div class="t-prog"><div class="bar"><i style="width:${t.progress}%"></i></div><small>${t.progress}%</small></div></div>`
  }
  function card(t) {
    return `<div class="kcard ${t.status === '完成' ? 'done' : ''}" draggable="true" data-id="${t.id}">
      <div class="t-title">${esc(t.title)}</div><div class="t-meta"><span class="pri p-${t.priority}">${t.priority}</span>${due(t)}${tags(t)}</div>
      <div class="bar"><i style="width:${t.progress}%"></i></div></div>`
  }
  function setupDnD(body) {
    body.querySelectorAll('.kcard').forEach((c) => {
      c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging') }
      c.ondragend = () => c.classList.remove('dragging')
    })
    body.querySelectorAll('.kcol').forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('over') }
      col.ondragleave = () => col.classList.remove('over')
      col.ondrop = (e) => {
        e.preventDefault(); col.classList.remove('over')
        const t = state.items.find((x) => x.id === e.dataTransfer.getData('text/plain'))
        if (t && t.status !== col.dataset.status) {
          const s = col.dataset.status
          update(t, { status: s, progress: s === '完成' ? 100 : t.progress })
        }
      }
    })
  }
  async function update(t, patch) {
    const old = { ...t }
    Object.assign(t, patch); draw()
    const { error } = await sb.from('tasks').update(patch).eq('id', t.id)
    if (handleErr(error, '更新失敗')) { Object.assign(t, old); draw() }
  }
  function edit(t) {
    const m = modal({
      title: '編輯待辦',
      body: `<label>標題<input name="title" value="${esc(t.title)}"></label>
        <label>說明<textarea name="description" rows="4">${esc(t.description || '')}</textarea></label>
        <div class="grid2"><label>狀態<select name="status">${STATUSES.map((s) => `<option ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>優先度<select name="priority">${PRIORITIES.map((s) => `<option ${s === t.priority ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>截止日<input type="date" name="due_date" value="${t.due_date || ''}"></label>
        <label>進度 <output>${t.progress}</output>%<input type="range" name="progress" min="0" max="100" step="5" value="${t.progress}"></label></div>
        <label>標籤（以逗號或空白分隔）<input name="tags" value="${esc(t.tags.join(', '))}"></label>`,
      actions: `<button class="btn danger" data-del>刪除</button><span class="spacer"></span><button class="btn" data-close2>取消</button><button class="btn primary" data-save>儲存</button>`,
    })
    const f = m.el
    f.querySelector('[name=progress]').oninput = (e) => (f.querySelector('output').textContent = e.target.value)
    f.querySelector('[data-close2]').onclick = m.close
    f.querySelector('[data-save]').onclick = async () => {
      const v = (n) => f.querySelector(`[name=${n}]`).value
      const patch = { title: v('title').trim() || '(未命名)', description: v('description'), status: v('status'), priority: v('priority'), due_date: v('due_date') || null, progress: +v('progress'), tags: parseTags(v('tags')) }
      if (patch.status === '完成' && t.status !== '完成') patch.progress = 100
      m.close(); await update(t, patch); toast('已儲存', 'success')
    }
    f.querySelector('[data-del]').onclick = async () => {
      if (!confirmBox(`確定刪除「${t.title}」？`)) return
      const { error } = await sb.from('tasks').delete().eq('id', t.id)
      if (handleErr(error, '刪除失敗')) return
      state.items = state.items.filter((x) => x.id !== t.id); m.close(); draw()
    }
  }
}
