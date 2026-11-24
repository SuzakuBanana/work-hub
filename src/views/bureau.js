import { sb } from '../supabase.js'
import { esc, handleErr, toast, ymd, confirmBox, debounce } from '../utils.js'

const STATUSES = ['未繳', '已繳', '已彙整']
const COLS = [
  { k: 'bureau', label: '局處', w: 120 },
  { k: 'topic', label: '主題', w: 150 },
  { k: 'period', label: '期別', w: 100 },
  { k: 'item', label: '項目', w: 170 },
  { k: 'value', label: '數值', w: 90, type: 'number' },
  { k: 'unit', label: '單位', w: 70 },
  { k: 'status', label: '狀態', w: 95, type: 'status' },
  { k: 'submitted_at', label: '繳交日', w: 135, type: 'date' },
  { k: 'note', label: '備註', w: 180 },
]
const f = { bureau: '', status: '', topic: '', q: '' }

export async function renderBureau(view) {
  let rows = []
  view.innerHTML = `<header class="page-head"><h1>📊 局處資料彙整</h1>
    <div class="actions"><button class="btn" data-csv>⬇ 匯出 CSV</button><button class="btn primary" data-add>＋ 新增一列</button></div></header>
    <div class="toolbar wrap"><select data-f="bureau"></select><select data-f="topic"></select><select data-f="status"><option value="">全部狀態</option>${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
      <input class="search" type="search" data-f="q" placeholder="搜尋項目、備註…"></div>
    <div class="stats"></div>
    <div class="table-wrap"><table class="grid"><thead><tr>${COLS.map((c) => `<th style="min-width:${c.w}px">${c.label}</th>`).join('')}<th></th></tr></thead><tbody></tbody></table></div>
    <p class="small muted">提示：直接點儲存格就能修改，離開欄位時自動儲存。複製範本列可按右側「⧉」。</p>`
  const tbody = view.querySelector('tbody')
  view.querySelectorAll('[data-f]').forEach((el) => { el.value = f[el.dataset.f]; el.oninput = () => { f[el.dataset.f] = el.value; drawRows() } })
  view.querySelector('[data-add]').onclick = () => addRow({ bureau: f.bureau, topic: f.topic, status: '未繳' })
  view.querySelector('[data-csv]').onclick = exportCsv

  const { data, error } = await sb.from('bureau_submissions').select('*').order('bureau').order('created_at')
  if (handleErr(error, '讀取彙整表失敗')) return
  rows = data
  drawFilters(); drawRows()

  function drawFilters() {
    const opts = (key, all) => `<option value="">${all}</option>` + [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant')).map((v) => `<option ${v === f[key] ? 'selected' : ''}>${esc(v)}</option>`).join('')
    view.querySelector('[data-f=bureau]').innerHTML = opts('bureau', '全部局處')
    view.querySelector('[data-f=topic]').innerHTML = opts('topic', '全部主題')
  }
  function visible() {
    const q = f.q.trim().toLowerCase()
    return rows.filter((r) => (!f.bureau || r.bureau === f.bureau) && (!f.status || r.status === f.status) && (!f.topic || r.topic === f.topic) &&
      (!q || COLS.some((c) => String(r[c.k] ?? '').toLowerCase().includes(q))))
  }
  function drawStats(v) {
    const by = (s) => v.filter((r) => r.status === s).length
    const bureaus = new Set(v.map((r) => r.bureau).filter(Boolean))
    const pending = [...new Set(v.filter((r) => r.status === '未繳').map((r) => r.bureau).filter(Boolean))]
    view.querySelector('.stats').innerHTML = `<div class="stat"><b>${v.length}</b><span>筆資料</span></div><div class="stat"><b>${bureaus.size}</b><span>個局處</span></div>
      ${STATUSES.map((s) => `<div class="stat ${s === '未繳' && by(s) ? 'warn' : ''}"><b>${by(s)}</b><span>${s}</span></div>`).join('')}
      ${pending.length ? `<div class="stat wide"><span>尚未繳交：</span><div class="small">${pending.map(esc).join('、')}</div></div>` : ''}`
  }
  function cell(r, c) {
    const v = r[c.k] ?? ''
    if (c.type === 'status') return `<select data-k="status" class="st st-${esc(v)}">${STATUSES.map((s) => `<option ${s === v ? 'selected' : ''}>${s}</option>`).join('')}</select>`
    return `<input data-k="${c.k}" type="${c.type || 'text'}" value="${esc(v)}" ${c.type === 'number' ? 'step="any" inputmode="decimal"' : ''}>`
  }
  function drawRows() {
    const v = visible()
    drawStats(v)
    tbody.innerHTML = v.length ? v.map((r) => `<tr data-id="${r.id}">${COLS.map((c) => `<td data-label="${c.label}">${cell(r, c)}</td>`).join('')}
      <td class="row-act"><button class="icon-btn" data-dup title="複製此列">⧉</button><button class="icon-btn danger-text" data-del title="刪除">🗑</button></td></tr>`).join('')
      : `<tr><td colspan="${COLS.length + 1}" class="empty">沒有資料，按「＋ 新增一列」開始。</td></tr>`
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
      const r = rows.find((x) => x.id === tr.dataset.id)
      tr.querySelectorAll('[data-k]').forEach((inp) => {
        inp.onchange = () => saveCell(r, inp)
      })
      tr.querySelector('[data-del]').onclick = async () => {
        if (!confirmBox('確定刪除這一列？')) return
        const { error } = await sb.from('bureau_submissions').delete().eq('id', r.id)
        if (handleErr(error, '刪除失敗')) return
        rows = rows.filter((x) => x !== r); drawFilters(); drawRows()
      }
      tr.querySelector('[data-dup]').onclick = () => { const { id, user_id, created_at, updated_at, ...rest } = r; addRow({ ...rest, value: null, status: '未繳', submitted_at: null }) }
    })
  }
  async function saveCell(r, inp) {
    const k = inp.dataset.k
    let val = inp.value
    if (k === 'value') val = val === '' ? null : Number(val)
    else if (k === 'submitted_at') val = val || null
    const patch = { [k]: val }
    if (k === 'status' && val !== '未繳' && !r.submitted_at) patch.submitted_at = ymd(new Date())
    if (k === 'status') inp.className = `st st-${val}`
    const { error } = await sb.from('bureau_submissions').update(patch).eq('id', r.id)
    if (handleErr(error, '儲存失敗')) { inp.value = r[k] ?? ''; return }
    Object.assign(r, patch)
    if (patch.submitted_at && k === 'status') drawRows()
    else drawStats(visible())
    if (k === 'bureau' || k === 'topic') drawFilters()
    inp.closest('td')?.classList.add('saved'); setTimeout(() => inp.closest('td')?.classList.remove('saved'), 700)
  }
  async function addRow(init) {
    const { data, error } = await sb.from('bureau_submissions').insert(init).select().single()
    if (handleErr(error, '新增失敗')) return
    rows.push(data); drawRows()
    const tr = tbody.querySelector(`tr[data-id="${data.id}"]`)
    tr?.scrollIntoView({ block: 'center' }); tr?.querySelector(init.bureau ? '[data-k=item]' : '[data-k=bureau]')?.focus()
  }
  function exportCsv() {
    const v = visible()
    if (!v.length) { toast('沒有可匯出的資料'); return }
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const csv = [COLS.map((c) => q(c.label)).join(','), ...v.map((r) => COLS.map((c) => q(r[c.k])).join(','))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }) // BOM：Excel 開啟中文不亂碼
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `局處彙整_${[f.bureau, f.topic, f.status].filter(Boolean).join('_') || '全部'}_${ymd(new Date())}.csv`
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    toast(`已匯出 ${v.length} 筆`, 'success')
  }
}
