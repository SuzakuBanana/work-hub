import { sb } from '../supabase.js'
import { esc, modal, handleErr, toast, ymd, hm, WEEK, toLocalInput, fromLocalInput, confirmBox } from '../utils.js'

const st = { mode: localStorage.getItem('cal.mode') || 'month', cursor: new Date() }

export async function renderCalendar(view) {
  let events = [], tasks = []
  view.innerHTML = `<header class="page-head"><h1>📅 會議行事曆</h1>
    <div class="seg"><button data-mode="month">月曆</button><button data-mode="list">清單</button></div></header>
    <div class="toolbar"><div class="cal-nav"><button class="btn sm" data-prev>‹</button><b class="cal-title"></b><button class="btn sm" data-next>›</button><button class="btn sm ghost" data-today>今天</button></div>
    <button class="btn primary" data-add>＋ 新增會議</button></div><div id="cal-body"></div>`
  view.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { st.mode = b.dataset.mode; localStorage.setItem('cal.mode', st.mode); draw() }))
  view.querySelector('[data-prev]').onclick = () => { st.cursor = new Date(st.cursor.getFullYear(), st.cursor.getMonth() - 1, 1); load() }
  view.querySelector('[data-next]').onclick = () => { st.cursor = new Date(st.cursor.getFullYear(), st.cursor.getMonth() + 1, 1); load() }
  view.querySelector('[data-today]').onclick = () => { st.cursor = new Date(); load() }
  view.querySelector('[data-add]').onclick = () => edit(null, new Date())
  sb.from('tasks').select('id,title,status').neq('status', '完成').order('created_at', { ascending: false }).then(({ data }) => (tasks = data || []))
  await load()

  async function load() {
    const y = st.cursor.getFullYear(), m = st.cursor.getMonth()
    const from = st.mode === 'list' ? new Date(y, m, 1) : new Date(y, m, 1 - new Date(y, m, 1).getDay())
    const to = st.mode === 'list' ? new Date(y, m + 1, 1) : new Date(from.getFullYear(), from.getMonth(), from.getDate() + 42)
    const { data, error } = await sb.from('events').select('*').gte('start_at', from.toISOString()).lt('start_at', to.toISOString()).order('start_at')
    if (handleErr(error, '讀取行事曆失敗')) return
    events = data; draw()
  }
  function draw() {
    view.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === st.mode))
    const y = st.cursor.getFullYear(), m = st.cursor.getMonth()
    view.querySelector('.cal-title').textContent = `${y} 年 ${m + 1} 月`
    const body = view.querySelector('#cal-body'), today = ymd(new Date())
    const byDay = {}
    events.forEach((e) => (byDay[ymd(new Date(e.start_at))] ||= []).push(e))
    if (st.mode === 'month') {
      const start = new Date(y, m, 1 - new Date(y, m, 1).getDay())
      let cells = ''
      for (let i = 0; i < 42; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), k = ymd(d)
        const evs = byDay[k] || []
        cells += `<div class="day ${d.getMonth() !== m ? 'other' : ''} ${k === today ? 'today' : ''} ${d.getDay() % 6 === 0 ? 'wkend' : ''}" data-day="${k}">
          <div class="dnum">${d.getDate()}</div>${evs.slice(0, 3).map((e) => `<div class="ev" data-ev="${e.id}"><span class="evt">${hm(new Date(e.start_at))}</span> ${esc(e.title)}</div>`).join('')}
          ${evs.length > 3 ? `<div class="more small">還有 ${evs.length - 3} 項</div>` : ''}${evs.length ? `<i class="dot"></i>` : ''}</div>`
      }
      body.innerHTML = `<div class="month"><div class="wk">${WEEK.map((w) => `<div>${w}</div>`).join('')}</div><div class="days">${cells}</div></div>
        <div class="day-detail"></div>`
      body.querySelectorAll('.day').forEach((el) => (el.onclick = (e) => {
        const ev = e.target.closest('[data-ev]')
        if (ev) { edit(events.find((x) => x.id === ev.dataset.ev)); return }
        body.querySelectorAll('.day.sel').forEach((x) => x.classList.remove('sel')); el.classList.add('sel')
        showDay(el.dataset.day, byDay[el.dataset.day] || [])
      }))
      showDay(today, byDay[today] || [], true)
    } else {
      const days = Object.keys(byDay).sort()
      body.innerHTML = days.length ? `<div class="agenda">${days.map((k) => {
        const d = new Date(k + 'T00:00')
        return `<div class="ag-day ${k === today ? 'today' : ''} ${k < today ? 'past' : ''}"><div class="ag-date"><b>${d.getDate()}</b><span>週${WEEK[d.getDay()]}</span></div><div class="ag-evs">${byDay[k].map(evRow).join('')}</div></div>`
      }).join('')}</div>` : '<div class="empty">這個月沒有會議。</div>'
      body.querySelectorAll('[data-ev]').forEach((el) => (el.onclick = () => edit(events.find((x) => x.id === el.dataset.ev))))
    }
  }
  function evRow(e) {
    const s = new Date(e.start_at), en = e.end_at ? new Date(e.end_at) : null
    const t = tasks.find((x) => x.id === e.related_task_id)
    return `<div class="ev-row" data-ev="${e.id}"><div class="ev-time">${hm(s)}${en ? `–${hm(en)}` : ''}</div><div><b>${esc(e.title)}</b>
      <div class="small muted">${e.location ? `📍 ${esc(e.location)}` : ''}${t ? ` ・ 🔗 ${esc(t.title)}` : ''}</div>${e.note ? `<div class="small clamp">${esc(e.note)}</div>` : ''}</div></div>`
  }
  function showDay(k, evs, quiet) {
    const box = view.querySelector('.day-detail'); if (!box) return
    const d = new Date(k + 'T00:00')
    if (quiet && !evs.length) { box.innerHTML = ''; return }
    box.innerHTML = `<div class="dd-head"><b>${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）</b><button class="btn sm primary" data-addday>＋ 這天新增</button></div>
      ${evs.map(evRow).join('') || '<p class="muted small">這天沒有會議</p>'}`
    box.querySelector('[data-addday]').onclick = () => { const dt = new Date(k + 'T09:00'); edit(null, dt) }
    box.querySelectorAll('[data-ev]').forEach((el) => (el.onclick = () => edit(events.find((x) => x.id === el.dataset.ev))))
  }
  function edit(e, date) {
    const isNew = !e
    const start = e ? e.start_at : (() => { const d = new Date(date); if (d.getMinutes() || d.getSeconds()) d.setHours(d.getHours() + 1, 0, 0, 0); return d.toISOString() })()
    const end = e ? e.end_at : new Date(new Date(start).getTime() + 3600e3).toISOString()
    const m = modal({
      title: isNew ? '新增會議' : '編輯會議',
      body: `<label>標題<input name="title" value="${esc(e?.title || '')}" placeholder="例：淨零推動會議"></label>
        <div class="grid2"><label>開始<input type="datetime-local" name="start_at" value="${toLocalInput(start)}"></label>
        <label>結束<input type="datetime-local" name="end_at" value="${toLocalInput(end)}"></label></div>
        <label>地點<input name="location" value="${esc(e?.location || '')}" placeholder="例：市政大樓 文心樓 4 樓"></label>
        <label>相關待辦<select name="related_task_id"><option value="">（無）</option>${tasks.map((t) => `<option value="${t.id}" ${t.id === e?.related_task_id ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select></label>
        <label>備註<textarea name="note" rows="4">${esc(e?.note || '')}</textarea></label>`,
      actions: `${isNew ? '' : '<button class="btn danger" data-del>刪除</button>'}<span class="spacer"></span><button class="btn primary" data-save>儲存</button>`,
    })
    const f = (n) => m.el.querySelector(`[name=${n}]`)
    f('start_at').onchange = () => { if (!f('end_at').value || f('end_at').value <= f('start_at').value) { const d = new Date(f('start_at').value); d.setHours(d.getHours() + 1); f('end_at').value = toLocalInput(d.toISOString()) } }
    m.el.querySelector('[data-save]').onclick = async () => {
      if (!f('start_at').value) { toast('請填開始時間', 'error'); return }
      const row = { title: f('title').value.trim() || '(未命名會議)', start_at: fromLocalInput(f('start_at').value), end_at: fromLocalInput(f('end_at').value), location: f('location').value, note: f('note').value, related_task_id: f('related_task_id').value || null }
      if (row.end_at && row.end_at < row.start_at) { toast('結束時間不能早於開始', 'error'); return }
      const { error } = isNew ? await sb.from('events').insert(row) : await sb.from('events').update(row).eq('id', e.id)
      if (handleErr(error, '儲存失敗')) return
      m.close(); toast('已儲存', 'success')
      st.cursor = new Date(row.start_at); load()
    }
    m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!confirmBox(`確定刪除「${e.title}」？`)) return
      const { error } = await sb.from('events').delete().eq('id', e.id)
      if (handleErr(error, '刪除失敗')) return
      m.close(); load()
    })
  }
}
