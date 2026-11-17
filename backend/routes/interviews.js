const express = require('express');
const store = require('../data/store');
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
