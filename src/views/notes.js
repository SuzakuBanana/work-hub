import { sb } from '../supabase.js'
import { esc, h, debounce, handleErr, toast, confirmBox } from '../utils.js'

const TYPES = [
  { t: 'p', label: '內文', icon: '¶', md: null },
  { t: 'h1', label: '大標題', icon: 'H1', md: '# ' },
  { t: 'h2', label: '中標題', icon: 'H2', md: '## ' },
  { t: 'h3', label: '小標題', icon: 'H3', md: '### ' },
  { t: 'bullet', label: '項目符號', icon: '•', md: '- ' },
  { t: 'number', label: '編號清單', icon: '1.', md: '1. ' },
  { t: 'todo', label: '核取清單', icon: '☐', md: '[] ' },
  { t: 'quote', label: '引言', icon: '❝', md: '> ' },
]
const LISTY = ['bullet', 'number', 'todo']
const ICONS = ['📄', '📝', '📌', '📁', '💡', '🌿', '🌏', '♻️', '⚡', '🚗', '🏛️', '📊', '📅', '✅', '🎤', '📣', '🔖', '⭐']
const uid = () => Math.random().toString(36).slice(2, 10)
const PH = { p: '輸入文字，或按「/」選擇區塊類型', h1: '大標題', h2: '中標題', h3: '小標題', bullet: '清單項目', number: '清單項目', todo: '待辦事項', quote: '引言' }

export async function renderNotes(view) {
  let pages = []
  let current = null // { id, title, icon, content: [] }
  let expanded = new Set(JSON.parse(localStorage.getItem('notes.expanded') || '[]'))
  let q = ''

  view.classList.add('full')
  view.innerHTML = `<div class="notes">
    <aside class="tree-pane"><div class="tree-head"><b>📝 筆記</b><button class="btn primary sm" data-new>＋ 新頁面</button></div>
      <input class="search" type="search" placeholder="搜尋頁面標題"><div class="tree"></div></aside>
    <section class="editor-pane"><div class="empty">選擇左側頁面，或按「＋ 新頁面」開始寫筆記。</div></section></div>`
  const treeEl = view.querySelector('.tree'), pane = view.querySelector('.editor-pane')
  view.querySelector('[data-new]').onclick = () => createPage(null)
  view.querySelector('.tree-pane .search').oninput = (e) => { q = e.target.value.trim().toLowerCase(); drawTree() }

  const save = debounce(async () => {
    if (!current) return
    const c = current
    setStatus('儲存中…')
    const { error } = await sb.from('pages').update({ title: c.title, icon: c.icon, content: c.content }).eq('id', c.id)
    if (handleErr(error, '自動儲存失敗')) { setStatus('⚠ 未儲存'); return }
    setStatus('✓ 已儲存')
  }, 700)
  const onUnload = () => save.flush()
  window.addEventListener('beforeunload', onUnload)

  const { data, error } = await sb.from('pages').select('id,title,icon,parent_id,sort_order,updated_at').order('sort_order').order('created_at')
  if (handleErr(error, '讀取筆記失敗')) return
  pages = data
  drawTree()
  const want = location.hash.split('/')[2]
  if (want && pages.some((p) => p.id === want)) openPage(want)
  else if (pages.length && window.innerWidth > 800) openPage(pages.find((p) => !p.parent_id)?.id || pages[0].id)


  function setStatus(s) { const el = pane.querySelector('.save-status'); if (el) el.textContent = s }
  function children(pid) { return pages.filter((p) => (p.parent_id || null) === pid) }
  function ancestors(id) { const out = []; let p = pages.find((x) => x.id === id); while (p?.parent_id) { p = pages.find((x) => x.id === p.parent_id); if (p) out.unshift(p) } return out }

  function drawTree() {
    const node = (p, depth) => {
      const kids = children(p.id)
      const open = expanded.has(p.id)
      return `<div class="tnode"><div class="trow ${current?.id === p.id ? 'active' : ''}" data-id="${p.id}" style="padding-left:${6 + depth * 14}px">
        <button class="tog ${kids.length ? '' : 'none'}" data-tog>${kids.length ? (open ? '▾' : '▸') : '•'}</button>
        <span class="ticon">${esc(p.icon || '📄')}</span><span class="ttitle">${esc(p.title || '未命名')}</span>
        <button class="tadd" data-add title="新增子頁面">＋</button></div>
        ${open ? kids.map((k) => node(k, depth + 1)).join('') : ''}</div>`
    }
    if (q) {
      const hits = pages.filter((p) => (p.title || '未命名').toLowerCase().includes(q))
      treeEl.innerHTML = hits.map((p) => `<div class="trow ${current?.id === p.id ? 'active' : ''}" data-id="${p.id}"><span class="ticon">${esc(p.icon || '📄')}</span><span class="ttitle">${esc(p.title || '未命名')}</span></div>`).join('') || '<p class="muted small">找不到頁面</p>'
    } else {
      treeEl.innerHTML = children(null).map((p) => node(p, 0)).join('') || '<p class="muted small">還沒有頁面</p>'
    }
    treeEl.querySelectorAll('.trow').forEach((r) => (r.onclick = (e) => {
      const id = r.dataset.id
      if (e.target.closest('[data-tog]')) { expanded.has(id) ? expanded.delete(id) : expanded.add(id); persistExp(); drawTree(); return }
      if (e.target.closest('[data-add]')) { createPage(id); return }
      openPage(id)
    }))
  }
  function persistExp() { localStorage.setItem('notes.expanded', JSON.stringify([...expanded])) }

  async function createPage(parentId) {
    save.flush()
    const sort_order = Math.max(0, ...children(parentId).map((p) => p.sort_order)) + 1
    const { data, error } = await sb.from('pages').insert({ title: '', icon: '📄', parent_id: parentId, sort_order, content: [{ id: uid(), type: 'p', text: '' }] }).select('id,title,icon,parent_id,sort_order,updated_at').single()
    if (handleErr(error, '新增頁面失敗')) return
    pages.push(data)
    if (parentId) { expanded.add(parentId); persistExp() }
    await openPage(data.id)
    pane.querySelector('.page-title')?.focus()
  }

  async function openPage(id) {
    save.flush()
    const { data, error } = await sb.from('pages').select('*').eq('id', id).single()
    if (handleErr(error, '開啟頁面失敗')) return
    current = { ...data, content: Array.isArray(data.content) && data.content.length ? data.content : [{ id: uid(), type: 'p', text: '' }] }
    history.replaceState(null, '', `#/notes/${id}`)
    ancestors(id).forEach((a) => expanded.add(a.id)); persistExp()
    drawTree(); drawEditor()
    view.querySelector('.notes').classList.add('has-page')
  }

  function drawEditor() {
    const c = current
    const crumbs = ancestors(c.id).map((a) => `<a href="javascript:void 0" data-go="${a.id}">${esc(a.icon || '📄')} ${esc(a.title || '未命名')}</a> / `).join('')
    pane.innerHTML = `<div class="ed-top"><button class="btn ghost sm back" data-back>← 頁面列表</button><div class="crumbs small muted">${crumbs}</div><span class="save-status small muted">✓ 已儲存</span>
      <button class="btn ghost sm" data-sub>＋ 子頁面</button><button class="btn ghost sm danger-text" data-delpage>刪除</button></div>
      <div class="doc"><button class="page-icon" title="更換圖示">${esc(c.icon || '📄')}</button>
      <div class="page-title" contenteditable="true" data-ph="未命名頁面" spellcheck="false"></div>
      <div class="blocks"></div>
      <div class="add-line" data-addline>＋ 點此新增一行</div>
      <div class="subpages"></div></div>`
    const titleEl = pane.querySelector('.page-title')
    titleEl.textContent = c.title
    titleEl.oninput = () => { c.title = titleEl.innerText.replace(/\n/g, ' ').trim(); const p = pages.find((x) => x.id === c.id); p.title = c.title; drawTree(); save() }
    titleEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); focusBlock(0, 0) } }
    pane.querySelector('[data-back]').onclick = () => view.querySelector('.notes').classList.remove('has-page')
    pane.querySelectorAll('[data-go]').forEach((a) => (a.onclick = () => openPage(a.dataset.go)))
    pane.querySelector('[data-sub]').onclick = () => createPage(c.id)
    pane.querySelector('[data-delpage]').onclick = deletePage
    pane.querySelector('.page-icon').onclick = (e) => iconPicker(e.currentTarget)
    pane.querySelector('[data-addline]').onclick = () => { c.content.push({ id: uid(), type: 'p', text: '' }); drawBlocks(); focusBlock(c.content.length - 1, 0); save() }
    const kids = children(c.id)
    pane.querySelector('.subpages').innerHTML = kids.length ? `<div class="small muted">子頁面</div>${kids.map((k) => `<a class="subpage" href="javascript:void 0" data-go="${k.id}">${esc(k.icon || '📄')} ${esc(k.title || '未命名')}</a>`).join('')}` : ''
    pane.querySelectorAll('.subpages [data-go]').forEach((a) => (a.onclick = () => openPage(a.dataset.go)))
    drawBlocks()
    const bl = pane.querySelector('.blocks')
    bl.addEventListener('input', onInput)
    bl.addEventListener('keydown', onKey)
    bl.addEventListener('paste', onPaste)
    bl.addEventListener('click', onClick)
  }

  function drawBlocks() {
    const bl = pane.querySelector('.blocks')
    let n = 0
    bl.innerHTML = current.content.map((b) => {
      n = b.type === 'number' ? n + 1 : 0
      const lead = b.type === 'todo' ? `<input type="checkbox" class="chk" ${b.checked ? 'checked' : ''}>`
        : b.type === 'bullet' ? '<span class="lead">•</span>' : b.type === 'number' ? `<span class="lead">${n}.</span>` : ''
      return `<div class="blk t-${b.type} ${b.checked ? 'checked' : ''}" data-bid="${b.id}"><button class="handle" title="區塊選單" tabindex="-1">⋮⋮</button>${lead}<div class="be" contenteditable="true" data-ph="${PH[b.type]}"></div></div>`
    }).join('')
    bl.querySelectorAll('.be').forEach((el, i) => (el.textContent = current.content[i].text))
  }
  const idxOf = (el) => current.content.findIndex((b) => b.id === el.closest('.blk')?.dataset.bid)
  function focusBlock(i, offset = 'end') {
    const el = pane.querySelectorAll('.blocks .be')[i]; if (!el) return
    el.focus(); setCaret(el, offset === 'end' ? el.textContent.length : offset)
  }

  function onInput(e) {
    const be = e.target.closest('.be'); if (!be) return
    const i = idxOf(be), b = current.content[i]
    b.text = be.innerText.replace(/\n$/, '')
    if (b.type === 'p' && !e.isComposing) {
      const hit = TYPES.find((t) => t.md && b.text.startsWith(t.md))
      if (hit) { b.type = hit.t; b.text = b.text.slice(hit.md.length); drawBlocks(); focusBlock(i, 0) }
    }
    if (b.text === '/' ) typeMenu(be, i, true)
    save()
  }
  function onKey(e) {
    const be = e.target.closest('.be'); if (!be) return
    const i = idxOf(be), b = current.content[i]
    const off = caretOffset(be), len = be.textContent.length
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      if (LISTY.includes(b.type) && !b.text) { b.type = 'p'; drawBlocks(); focusBlock(i, 0); save(); return }
      const text = be.textContent
      b.text = text.slice(0, off)
      const nb = { id: uid(), type: LISTY.includes(b.type) ? b.type : 'p', text: text.slice(off) }
      current.content.splice(i + 1, 0, nb)
      drawBlocks(); focusBlock(i + 1, 0); save()
    } else if (e.key === 'Backspace' && off === 0 && window.getSelection().isCollapsed) {
      if (b.type !== 'p') { e.preventDefault(); b.type = 'p'; drawBlocks(); focusBlock(i, 0); save() }
      else if (i > 0) {
        e.preventDefault()
        const prev = current.content[i - 1], at = prev.text.length
        prev.text += b.text; current.content.splice(i, 1)
        drawBlocks(); focusBlock(i - 1, at); save()
      }
    } else if (e.key === 'ArrowUp' && off === 0 && i > 0) { e.preventDefault(); focusBlock(i - 1) }
    else if (e.key === 'ArrowDown' && off === len && i < current.content.length - 1) { e.preventDefault(); focusBlock(i + 1, 0) }
  }
  function onPaste(e) {
    e.preventDefault()
    const text = (e.clipboardData || window.clipboardData).getData('text/plain')
    const be = e.target.closest('.be'); if (!be) return
    const lines = text.replace(/\r/g, '').split('\n')
    if (lines.length === 1) { document.execCommand('insertText', false, text); return }
    const i = idxOf(be), b = current.content[i], off = caretOffset(be), full = be.textContent
    b.text = full.slice(0, off) + lines[0]
    const rest = lines.slice(1).map((l) => { const hit = TYPES.find((t) => t.md && l.startsWith(t.md)); return { id: uid(), type: hit ? hit.t : 'p', text: hit ? l.slice(hit.md.length) : l } })
    rest[rest.length - 1].text += full.slice(off)
    current.content.splice(i + 1, 0, ...rest)
    drawBlocks(); focusBlock(i + rest.length); save()
  }
  function onClick(e) {
    const blk = e.target.closest('.blk'); if (!blk) return
    const i = current.content.findIndex((b) => b.id === blk.dataset.bid)
    if (e.target.classList.contains('chk')) { current.content[i].checked = e.target.checked; blk.classList.toggle('checked', e.target.checked); save() }
    if (e.target.closest('.handle')) typeMenu(e.target.closest('.handle'), i, false)
  }

  function typeMenu(anchor, i, fromSlash) {
    document.querySelector('.pop')?.remove()
    const r = anchor.getBoundingClientRect()
    const pop = h(`<div class="pop" style="top:${Math.min(r.bottom + 4, innerHeight - 380)}px;left:${Math.min(r.left, innerWidth - 220)}px">
      <div class="small muted">轉換成</div>${TYPES.map((t) => `<button data-t="${t.t}"><span class="ti">${t.icon}</span>${t.label}${t.md ? `<small>${esc(t.md.trim())}</small>` : ''}</button>`).join('')}
      ${fromSlash ? '' : `<hr><button data-act="up">⬆ 上移</button><button data-act="down">⬇ 下移</button><button data-act="dup">⧉ 複製區塊</button><button data-act="del" class="danger-text">🗑 刪除區塊</button>`}</div>`)
    document.body.append(pop)
    const close = () => { pop.remove(); document.removeEventListener('mousedown', out, true) }
    const out = (e) => { if (!pop.contains(e.target)) close() }
    setTimeout(() => document.addEventListener('mousedown', out, true))
    pop.onclick = (e) => {
      const btn = e.target.closest('button'); if (!btn) return
      const c = current.content, b = c[i]
      if (btn.dataset.t) { b.type = btn.dataset.t; if (fromSlash) b.text = b.text.replace(/^\//, '') }
      const act = btn.dataset.act
      let focus = i
      if (act === 'up' && i > 0) { [c[i - 1], c[i]] = [c[i], c[i - 1]]; focus = i - 1 }
      if (act === 'down' && i < c.length - 1) { [c[i + 1], c[i]] = [c[i], c[i + 1]]; focus = i + 1 }
      if (act === 'dup') c.splice(i + 1, 0, { ...b, id: uid() })
      if (act === 'del') { c.splice(i, 1); if (!c.length) c.push({ id: uid(), type: 'p', text: '' }); focus = Math.max(0, i - 1) }
      close(); drawBlocks(); focusBlock(focus); save()
    }
  }

  function iconPicker(anchor) {
    document.querySelector('.pop')?.remove()
    const r = anchor.getBoundingClientRect()
    const pop = h(`<div class="pop icons" style="top:${r.bottom + 4}px;left:${Math.min(r.left, innerWidth - 260)}px">${ICONS.map((i) => `<button>${i}</button>`).join('')}</div>`)
    document.body.append(pop)
    const out = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', out, true) } }
    setTimeout(() => document.addEventListener('mousedown', out, true))
    pop.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return
      current.icon = b.textContent; anchor.textContent = b.textContent
      pages.find((x) => x.id === current.id).icon = b.textContent
      pop.remove(); drawTree(); save()
    }
  }

  async function deletePage() {
    const c = current
    const count = (id) => children(id).reduce((s, k) => s + 1 + count(k.id), 0)
    const n = count(c.id)
    if (!confirmBox(`確定刪除「${c.title || '未命名'}」${n ? `以及底下 ${n} 個子頁面` : ''}？此動作無法復原。`)) return
    const { error } = await sb.from('pages').delete().eq('id', c.id)
    if (handleErr(error, '刪除失敗')) return
    const gone = new Set([c.id]); let grew = true
    while (grew) { grew = false; pages.forEach((p) => { if (p.parent_id && gone.has(p.parent_id) && !gone.has(p.id)) { gone.add(p.id); grew = true } }) }
    pages = pages.filter((p) => !gone.has(p.id))
    current = null
    history.replaceState(null, '', '#/notes')
    pane.innerHTML = '<div class="empty">頁面已刪除。</div>'
    view.querySelector('.notes').classList.remove('has-page')
    drawTree(); toast('已刪除頁面')
  }

  return () => { save.flush(); window.removeEventListener('beforeunload', onUnload); document.querySelector('.pop')?.remove(); view.classList.remove('full') }
}

function caretOffset(el) {
  const sel = window.getSelection(); if (!sel.rangeCount) return 0
  const r = sel.getRangeAt(0)
  if (!el.contains(r.startContainer)) return 0
  const pre = r.cloneRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset)
  return pre.toString().length
}
function setCaret(el, offset) {
  const sel = window.getSelection(), r = document.createRange()
  let left = offset
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    if (left <= node.length) { r.setStart(node, left); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); return }
    left -= node.length
  }
  r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r)
}
