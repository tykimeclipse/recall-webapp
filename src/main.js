import './style.css'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gspsquuyqkydqphbcuel.supabase.co'
const supabaseKey = 'sb_publishable_osq8Sjog7qDEiZ3A8toJ6Q_TQ3ATAt6'

const supabase = createClient(supabaseUrl, supabaseKey)
const DEV_STUDENT_ID = '9dc9cad6-b7eb-428d-9ad8-169f92b4b73e'
const app = document.querySelector('#app')

async function loadPages(){

  const { data, error } = await supabase
    .from('note_pages')
    .select('*')

  if(error){
    app.innerHTML = error.message
    return
  }

  app.innerHTML = `
  <h2>노트 페이지 목록</h2>

  ${data.map(p => `
    <div style="margin-bottom:30px">

      <h3>${p.title}</h3>

      <button data-url="${p.page_url}" data-pageid="${p.id}">
      노트 렌더링
      </button>

      <div class="note"></div>

    </div>
  `).join('')}
  `

  document.querySelectorAll('button').forEach(btn => {

    btn.addEventListener('click', async () => {
  const url = btn.dataset.url

  const res = await fetch(url, { cache: 'no-store' })
  const html = await res.text()

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const bodyHtml = doc.body ? doc.body.innerHTML : html

  const noteBox = btn.parentElement.querySelector('.note')
  noteBox.innerHTML = bodyHtml

  // 웹앱 쪽에서 blank 스타일 강제 적용
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

  // 빈칸이 비어 있으면 폭이 0이 되기 쉬우니 공백 채우기
  noteBox.querySelectorAll('.blank').forEach(el => {
    if ((el.innerHTML || '').trim() === '') el.innerHTML = '&nbsp;'
  })

  // 빈칸 클릭 이벤트 연결
  noteBox.querySelectorAll('.blank').forEach(el => {
    el.addEventListener('click', async () => {
  const blankNo = Number(el.getAttribute('data-blank-no'))
  const pageId = btn.dataset.pageid

  // 1) question_id + answer_key 가져오기
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

  // 2) 정답 표시
  el.textContent = data.answer_key
  el.style.borderBottomColor = 'transparent'

  // 3) self_assessment 선택(임시 UI)
  const choice = prompt('self_assessment 입력: correct / confused / wrong', 'correct')
  if (!choice) return

  const selfAssessment = choice.trim()

  // 4) attempts insert
  const payload = {
    student_id: DEV_STUDENT_ID,
    question_id: data.question_id,
    activity_type: 'recall',
    response: data.answer_key,          // 지금은 정답을 response로 저장(나중에 학생입력으로 바꿀 수 있음)
    self_assessment: selfAssessment,
    is_correct: selfAssessment === 'correct',
    score: selfAssessment === 'correct' ? 1 : 0
  }

  const { error: insErr } = await supabase
    .from('attempts')
    .insert(payload)

  if (insErr) {
    alert('attempts 저장 실패: ' + insErr.message)
    return
  }

  alert('attempts 저장 성공')
})
  })
})

  })

}

loadPages()