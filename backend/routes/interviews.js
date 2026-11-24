const express = require('express');
const store = require('../db/store');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// [ITV-01] ① 인터뷰 단원 생성
router.post('/', authenticate, (req, res) => {
  const { chapter_name } = req.body || {};

  if (!chapter_name || !String(chapter_name).trim()) {
    return res.status(400).json({
      success: false,
      error: { status: 400, message: '자서전 단원명(chapter_name)은 필수입니다.' },
    });
  }

  const newInterview = {
    interview_id: store.seq.interview_id++,
    user_id: req.user.user_id,
    chapter_name: String(chapter_name).trim(),
    created_at: new Date().toISOString(),
  };

  store.interviews.push(newInterview);

  return res.status(201).json({
    success: true,
    message: '자서전 단원이 생성되었습니다.',
    data: newInterview,
  });
});

// [ITV-01] ② 인터뷰 단원 목록 조회
router.get('/', authenticate, (req, res) => {
  const myInterviews = store.interviews.filter((i) => i.user_id === req.user.user_id);
  return res.status(200).json({
    success: true,
    data: myInterviews,
  });
});

// [ITV-03] ⑤ Groq AI 다음 질문 생성 (기존 groq.php 로직 이식)
router.post('/ai-question', authenticate, async (req, res) => {
  try {
    const GROQ_API_KEY = "여기에 키 넣으면 돼";
    if (!GROQ_API_KEY) {
      return res.status(500).json({
        success: false,
        ok: false,
        error: { status: 500, message: '서버(.env)에 GROQ_API_KEY가 설정되지 않았습니다.' },
      });
    }

    const { history } = req.body || {};
    if (!Array.isArray(history)) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: { status: 400, message: '요청 데이터(history 배열)가 올바르지 않습니다.' },
      });
    }

    // 1. history 배열 뒤에서부터 가장 최근 user 답변 추출
    let answer = '';
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]?.role === 'user' && typeof history[i]?.content === 'string') {
        answer = history[i].content.trim();
        break;
      }
    }

    if (!answer) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: { status: 400, message: '사용자의 답변을 찾지 못했습니다.' },
      });
    }

    // 2. 너무 긴 입력은 300자로 제한 (기존 PHP 로직 동일)
    answer = answer.slice(0, 300);

    // 3. Groq API 호출
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Medelivery-AI-Interview/1.0',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          {
            role: 'system',
            content:
              '당신은 한국어 자서전 인터뷰어입니다. ' +
              '사용자의 답변을 바탕으로 다음 질문 하나만 만드세요. ' +
              '반드시 존댓말을 쓰고, 답변과 직접 연결하세요. ' +
              '짧은 답변이면 장소, 사람, 감정 또는 당시의 기억을 구체적으로 물어보세요. ' +
              '번호나 인사말 없이 자연스러운 질문 한 문장만 출력하세요.',
          },
          {
            role: 'user',
            content: '사용자의 답변: ' + answer,
          },
        ],
       temperature: 0.4,
        max_completion_tokens: 3000,
        reasoning_effort: 'low',
        stream: false,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message = data?.error?.message || `Groq API 오류 (HTTP ${response.status})`;
      return res.status(502).json({
        success: false,
        ok: false,
        error: { status: 502, message },
      });
    }

    let question = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!question) {
      return res.status(502).json({
        success: false,
        ok: false,
        error: { status: 502, message: 'Groq가 질문을 반환하지 않았습니다.' },
      });
    }

    // 4. 번호 및 앞뒤 따옴표 제거 후처리 (기존 PHP 정규식 동일)
    question = question
      .replace(/^\s*(질문\s*)?\d+\s*[:.)-]\s*/u, '')
      .replace(/^[ \t\n\r"“”]+|[ \t\n\r"“”]+$/g, '');

    // 기존 PHP({ ok, question })와 현재 프로젝트 규격({ success, data }) 모두 호환되도록 반환
    return res.status(200).json({
      success: true,
      ok: true,
      question,
      data: { question },
    });
  } catch (error) {
    console.error('Groq 연결 실패:', error);
    return res.status(502).json({
      success: false,
      ok: false,
      error: { status: 502, message: `Groq 연결 실패: ${error.message}` },
    });
  }
});

// [ITV-02] ③ 질문·답변 기록 저장 (interviewQs: question_id, interview_id, question_answer 3컬럼 준수)
router.post('/:interview_id/questions', authenticate, (req, res) => {
  const interviewId = Number(req.params.interview_id);
  const interview = store.interviews.find(
    (i) => i.interview_id === interviewId && i.user_id === req.user.user_id
  );

  if (!interview) {
    return res.status(404).json({
      success: false,
      error: { status: 404, message: '해당 자서전 단원을 찾을 수 없습니다.' },
    });
  }

  const body = req.body || {};
  let question_answer = body.question_answer;

  // 프론트에서 { question, answer } 형태로 분리해 보낼 경우 단일 텍스트로 병합
  if (!question_answer && (body.question || body.answer)) {
    question_answer = `Q: ${body.question || ''}\nA: ${body.answer || ''}`.trim();
  }

  if (!question_answer || !String(question_answer).trim()) {
    return res.status(400).json({
      success: false,
      error: { status: 400, message: '질문·답변 내용(question_answer)은 필수입니다.' },
    });
  }

  const newQuestion = {
    question_id: store.seq.question_id++,
    interview_id: interviewId,
    question_answer: String(question_answer),
  };

  store.interviewQs.push(newQuestion);

  return res.status(201).json({
    success: true,
    message: '질문·답변 기록이 저장되었습니다.',
    data: newQuestion,
  });
});

// [ITV-02] ④ 단원별 질문·답변 조회
router.get('/:interview_id/questions', authenticate, (req, res) => {
  const interviewId = Number(req.params.interview_id);
  const interview = store.interviews.find(
    (i) => i.interview_id === interviewId && i.user_id === req.user.user_id
  );

  if (!interview) {
    return res.status(404).json({
      success: false,
      error: { status: 404, message: '해당 자서전 단원을 찾을 수 없습니다.' },
    });
  }

  const questions = store.interviewQs.filter((q) => q.interview_id === interviewId);

  return res.status(200).json({
    success: true,
    data: {
      interview_id: interview.interview_id,
      user_id: interview.user_id,
      chapter_name: interview.chapter_name,
      created_at: interview.created_at,
      questions,
    },
  });
});

module.exports = router;