import './style.css'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://gspsquuyqkydqphbcuel.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '' // anon key (eyJ...)
const supabase = createClient(supabaseUrl, supabaseKey)

const app = document.querySelector('#app')

/* ---------------- Toast UI ---------------- */

function toast(msg, type = 'info') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.position = 'fixed'
  el.style.bottom = '20px'
  el.style.right = '20px'
  el.style.padding = '10px 14px'
  el.style.borderRadius = '6px'
  el.style.background = type === 'error' ? '#e74c3c' : '#2ecc71'
  el.style.color = 'white'
  el.style.fontSize = '14px'
  el.style.zIndex = 9999
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 2500)
}

/* ---------------- Auth Helpers ---------------- */

async function getAuthEmail() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.email ?? null
}

async function getOrCreateStudentId() {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) throw new Error('로그인이 필요합니다.')

  const { data: row, error } = await supabase
    .from('students')
    .upsert({ student_id: user.id, name: user.email }, { onConflict: 'student_id' })
    .select('student_id')
    .single()

  if (error) throw error
  return row.student_id
}

/* ---------------- UI ---------------- */

function headerHtml(email) {
  return `
    <div style="margin:16px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <input id="email" placeholder="email" style="padding:8px;min-width:240px;" />
      <button data-action="login">매직링크 로그인</button>
      <button data-action="logout">로그아웃</button>
      <span id="authStatus" style="color:#555;">${email ? `로그인됨: ${email}` : '로그아웃 상태'}</span>
    </div>
  `
}

function pageCardHtml(p) {
  return `
    <div class="pageCard" data-pageid="${p.id}" style="margin-bottom:30px;">
      <h3>${p.title ?? ''}</h3>
      <button data-action="renderNote" data-url="${p.page_url}">노트 렌더링</button>
      <div class="note" style="margin-top:10px;"></div>
    </div>
  `
}

/* ---------------- Network helpers ---------------- */

async function fetchHtmlOrThrow(url) {
  let res
  try {
    res = await fetch(url, { cache: 'no-store' })
  } catch (e) {
    throw new Error('네트워크 오류: fetch 실패')
  }
  if (!res.ok) {
    throw new Error(`노트 불러오기 실패: ${res.status} ${res.statusText}`)
  }
  return await res.text()
}

/* ---------------- Note render helpers ---------------- */

function ensureBlankStyle(noteBox) {
  if (noteBox.querySelector('style[data-blank-style="1"]')) return
  const styleTag = document.createElement('style')
  styleTag.setAttribute('data-blank-style', '1')
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
}

function normalizeBlanks(noteBox) {
  noteBox.querySelectorAll('.blank').forEach(el => {
    if ((el.innerHTML || '').trim() === '') el.innerHTML = '&nbsp;'
  })
}

function mountAssessmentUI(noteBox, questionId, answerKey) {
  // 기존 선택 UI 제거
  const old = noteBox.querySelector('[data-choicebox="1"]')
  if (old) old.remove()

  const choiceBox = document.createElement('div')
  choiceBox.setAttribute('data-choicebox', '1')
  choiceBox.setAttribute('data-question-id', questionId)
  choiceBox.setAttribute('data-answer-key', answerKey)

  choiceBox.innerHTML = `
    <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
      <button data-action="pickAssessment" data-value="correct">맞음</button>
      <button data-action="pickAssessment" data-value="confused">헷갈림</button>
      <button data-action="pickAssessment" data-value="wrong">틀림</button>
    </div>
  `

  noteBox.appendChild(choiceBox)
}

/* ---------------- Actions (Action Map) ---------------- */

const actions = {
  async login() {
    const email = document.querySelector('#email')?.value?.trim()
    if (!email) return toast('이메일 입력 필요', 'error')

    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) toast(error.message, 'error')
    else toast('메일함에서 로그인 링크 확인')
  },

  async logout() {
    const { error } = await supabase.auth.signOut()
    if (error) toast(error.message, 'error')
    else toast('로그아웃')
  },

  async renderNote(_evt, el) {
    const card = el.closest('.pageCard')
    const pageId = card?.dataset.pageid
    const url = el.dataset.url
    const noteBox = card?.querySelector('.note')
    if (!pageId || !url || !noteBox) return

    noteBox.textContent = '불러오는 중...'

    try {
      const html = await fetchHtmlOrThrow(url)
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const body = doc.body?.innerHTML ?? html

      noteBox.innerHTML = body
      ensureBlankStyle(noteBox)
      normalizeBlanks(noteBox)

      toast('노트 로드 완료')
    } catch (e) {
      console.error(e)
      noteBox.textContent = e?.message ?? '노트 로드 실패'
      toast(noteBox.textContent, 'error')
    }
  },

  async blankClick(_evt, el) {
    const blankEl = el
    const card = blankEl.closest('.pageCard')
    const noteBox = blankEl.closest('.note')
    const pageId = card?.dataset.pageid
    if (!pageId || !noteBox) return

    const blankNo = Number(blankEl.getAttribute('data-blank-no'))
    if (!blankNo) return toast('blank_no가 없습니다.', 'error')

    const { data, error } = await supabase
      .from('questions')
      .select('question_id, answer_key')
      .eq('page_id', pageId)
      .eq('blank_no', blankNo)
      .single()

    if (error) {
      toast('정답 조회 실패: ' + error.message, 'error')
      return
    }

    blankEl.textContent = data.answer_key
    blankEl.style.borderBottomColor = 'transparent'

    // state.last 제거: 필요한 값은 choiceBox의 dataset에 저장(표준적)
    mountAssessmentUI(noteBox, data.question_id, data.answer_key)
  },

  async pickAssessment(_evt, el) {
    const selfAssessment = el.dataset.value
    if (!selfAssessment) return

    const choiceBox = el.closest('[data-choicebox="1"]')
    const noteBox = el.closest('.note')
    if (!choiceBox || !noteBox) return

    const questionId = choiceBox.getAttribute('data-question-id')
    if (!questionId) return toast('question_id 누락', 'error')

    try {
      const studentId = await getOrCreateStudentId()

      const payload = {
        student_id: studentId,
        question_id: questionId,
        activity_type: 'NOTE_RECALL',
        response: null,
        self_assessment: selfAssessment,
        is_correct: selfAssessment === 'correct',
        score: selfAssessment === 'correct' ? 1 : 0
      }

      const { error: insErr } = await supabase.from('attempts').insert(payload)

      if (insErr) {
        toast('저장 실패: ' + insErr.message, 'error')
        return
      }

      toast('저장 완료')
      choiceBox.remove()
    } catch (e) {
      toast(e?.message ?? '저장 실패', 'error')
    }
  }
}

/* ---------------- Render ---------------- */

async function loadPages() {
  const email = await getAuthEmail()

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

  app.innerHTML =
    headerHtml(email) +
    `
      <h2>노트 페이지 목록</h2>
      ${(data ?? []).map(pageCardHtml).join('')}
    `
}

/* ---------------- Event delegation (single listener) ---------------- */

document.addEventListener('click', async (e) => {
  const target = e.target
  if (!(target instanceof HTMLElement)) return

  // 1) data-action 라우팅
  const actionEl = target.closest('[data-action]')
  if (actionEl) {
    const action = actionEl.dataset.action
    const fn = actions[action]
    if (typeof fn === 'function') {
      await fn(e, actionEl)
      return
    }
  }

  // 2) blank 클릭 라우팅(.blank는 노트 HTML에서 넘어오므로 data-action이 없을 수 있음)
  const blankEl = target.closest('.blank')
  if (blankEl) {
    await actions.blankClick(e, blankEl)
  }
})

/* ---------------- Auth state change: single render trigger ---------------- */

supabase.auth.onAuthStateChange(async () => {
  // INITIAL_SESSION 포함하여 여기서만 렌더링 트리거
  await loadPages()
})