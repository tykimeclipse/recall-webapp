import './style.css'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gspsquuyqkydqphbcuel.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '' // anon key(eyJ...)를 .env에 넣어두세요
const supabase = createClient(supabaseUrl, supabaseKey)

const app = document.querySelector('#app')

async function getAuthEmail() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.email ?? null
}

async function getOrCreateStudentId() {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) throw new Error('로그인이 필요합니다.')

  // students에 없으면 생성(이메일을 이름 대신 임시로)
  const { data: row, error } = await supabase
    .from('students')
    .upsert({ student_id: user.id, name: user.email }, { onConflict: 'student_id' })
    .select('student_id')
    .single()

  if (error) throw error
  return row.student_id
}

function headerHtml(email) {
  return `
    <div style="margin:16px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <input id="email" placeholder="email" style="padding:8px;min-width:240px;" />
      <button id="loginBtn" style="padding:8px 10px;">매직링크 로그인</button>
      <button id="logoutBtn" style="padding:8px 10px;">로그아웃</button>
      <span id="authStatus" style="color:#555;">${email ? `로그인됨: ${email}` : '로그아웃 상태'}</span>
    </div>
  `
}

function attachRenderHandlers() {
  document.querySelectorAll('.renderBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.url
      const pageId = btn.dataset.pageid
      const noteBox = btn.parentElement.querySelector('.note')
      if (!url || !pageId || !noteBox) return
      noteBox.textContent = '불러오는 중...'
      const res = await fetch(url, { cache: 'no-store' })
      const html = await res.text()
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const body = doc.body?.innerHTML ?? html
      noteBox.innerHTML = body
      const styleTag = document.createElement('style')
      styleTag.textContent = `
        .blank{
          border-bottom:2px solid #000;
          display:inline-block;
          min-width:60px;
          height:1em;
          cursor:pointer;
          vertical-align:baseline;
        }
      `
      noteBox.prepend(styleTag)
      noteBox.querySelectorAll('.blank').forEach(el => {
        if ((el.innerHTML || '').trim() === '') el.innerHTML = '&nbsp;'
      })
      noteBox.querySelectorAll('.blank').forEach(el => {
        el.addEventListener('click', async () => {
          const blankNo = Number(el.getAttribute('data-blank-no'))
          if (!blankNo) return
          const { data, error } = await supabase
            .from('questions')
            .select('question_id, answer_key')
            .eq('page_id', pageId)
            .eq('blank_no', blankNo)
            .single()
          if (error) {
            alert('정답 조회 실패: ' + error.message)
            return
          }
          el.textContent = data.answer_key
          el.style.borderBottomColor = 'transparent'
          const old = noteBox.querySelector('[data-choicebox]')
          if (old) old.remove()
          const choiceBox = document.createElement('div')
          choiceBox.setAttribute('data-choicebox', '1')
          choiceBox.innerHTML = `
            <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
              <button data-v="correct">맞음</button>
              <button data-v="confused">헷갈림</button>
              <button data-v="wrong">틀림</button>
            </div>
          `
          noteBox.appendChild(choiceBox)
          choiceBox.querySelectorAll('button[data-v]').forEach(btn2 => {
            btn2.addEventListener('click', async () => {
              const selfAssessment = btn2.dataset.v
              const payload = {
                student_id: studentId,
                question_id: data.question_id,
                activity_type: 'NOTE_RECALL',
                response: null,
                self_assessment: selfAssessment,
                is_correct: selfAssessment === 'correct',
                score: selfAssessment === 'correct' ? 1 : 0
              }
              const studentId = await getOrCreateStudentId()
              const { error: insErr } = await supabase.from('attempts').insert(payload)
              if (insErr) {
                alert('저장 실패: ' + insErr.message)
                return
              }
              choiceBox.remove()
            })
          })
        })
      })
    })
  })
}

async function loadPages() {
  const email = await getAuthEmail()
  console.log('auth email:', email)
  const { data, error } = await supabase
    .from('note_pages')
    .select('*')
    .order('subject')
    .order('unit')
    .order('page_no')
  if (error) {
    app.innerHTML = 'error: ' + error.message
    return
  }
  app.innerHTML = headerHtml(email) + `
    <h2>노트 페이지 목록</h2>
    ${(data ?? []).map(p => `
      <div style="margin-bottom:30px">
        <h3>${p.title ?? ''}</h3>
        <button class="renderBtn" data-url="${p.page_url}" data-pageid="${p.id}">노트 렌더링</button>
        <div class="note" style="margin-top:10px;"></div>
      </div>
    `).join('')}
  `
  attachRenderHandlers()
}

document.addEventListener('click', async (e) => {
  const t = e.target
  if (!(t instanceof HTMLElement)) return
  if (t.id === 'loginBtn') {
    const email = document.querySelector('#email')?.value?.trim()
    if (!email) return alert('이메일을 입력하세요.')
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) alert(error.message)
    else alert('메일함에서 링크를 눌러 로그인하세요.')
  }
  if (t.id === 'logoutBtn') {
    const { error } = await supabase.auth.signOut()
    if (error) alert(error.message)
    else alert('로그아웃')
  }
})

supabase.auth.onAuthStateChange(async () => {
  await loadPages()
})

loadPages()