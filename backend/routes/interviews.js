const express = require('express');
const { store, seq, saveStoreToDisk } = require('../db/store');
const { HttpError, asyncHandler, authenticate } = require('../middleware/auth');

const router = express.Router();

// 모든 AI 자서전 인터뷰 API는 로그인 인증 필요 (호출 시 last_active_at 자동 갱신)
router.use(authenticate);

/**
 * [1. AI 인터뷰 질문 생성기 — 추후 LLM 모델(Gemini / OpenAI) 자동 연동]
 * - GEMINI_API_KEY가 .env에 설정되어 있으면 Google Gemini LLM이 이전 대화를 읽고 다음 질문을 생성합니다.
 * - 키가 없더라도 단원 주제와 문답 단계에 맞춰 자연스러운 다음 인터뷰 질문이 자동 생성됩니다.
 */
async function generateNextAiQuestion(chapterName, previousQuestions = []) {
  // 자서전 본문 레코드는 제외한 순수 Q&A 개수 계산
  const pureQna = previousQuestions.filter(
    (q) => !String(q.question_answer).startsWith('[자서전 완성본]')
  );
  const stepIndex = pureQna.length;
  const chapter = String(chapterName || '').trim();

  // .env에 GEMINI_API_KEY가 있는 경우 실제 Google Gemini API 호출
  if (process.env.GEMINI_API_KEY) {
    try {
      const historyText = pureQna.map((q) => q.question_answer).join('\n\n');
      const prompt = `당신은 사용자의 인생 이야기를 따뜻하게 이끌어내는 자서전 인터뷰어입니다.
현재 단원 주제는 「${chapter}」입니다.
지금까지의 문답 기록:
${historyText || '(아직 문답 없음 - 첫 질문을 해주세요)'}

위 맥락에 이어서 사용자가 그때의 기억과 감정을 떠올릴 수 있는 따뜻하고 구체적인 다음 질문 1개만 한국어 한두 문장으로 작성해 주세요. ("Q:" 접두사 없이 질문만 출력)`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );
      if (response.ok) {
        const json = await response.json();
        const aiText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (aiText) return aiText;
      }
    } catch (err) {
      console.warn('[AI Interview] Gemini API 호출 실패, 내장 시나리오로 대체합니다:', err.message);
    }
  }

  // 기본 내장 AI 인터뷰 질문 시나리오
  const defaultFlow = [
    `「${chapter}」 단원을 시작해 볼까요? 이 시기를 떠올렸을 때 가장 먼저 생각나는 장면이나 장소는 어디인가요?`,
    `그 당시 함께했던 사람들 중에서 지금도 마음속에 깊이 남아 있는 분과 그분과의 일화를 들려주세요.`,
    `그 시절에 겪었던 가장 큰 도전이나 전환점은 무엇이었나요? 그때 어떤 마음으로 이겨내셨는지 궁금합니다.`,
    `시간이 흐른 지금 돌이켜볼 때, 그 시절의 나에게 꼭 해주고 싶은 한마디가 있다면 무엇인가요?`,
    `마지막으로 「${chapter}」 단원을 읽게 될 소중한 가족이나 후손들에게 전하고 싶은 삶의 지혜를 남겨주세요.`,
  ];

  if (stepIndex < defaultFlow.length) {
    return defaultFlow[stepIndex];
  }

  return `「${chapter}」에 대해 더 남기고 싶은 소중한 기억이나 에피소드가 있다면 자유롭게 들려주세요. (${stepIndex + 1}번째 질문)`;
}

/**
 * [2. 문답(Q&A) 기반 1인칭 자서전 본문 자동 생성기 — LLM & 내장 에디터 호환]
 * - 해당 단원에 쌓인 질문·답변(interviewQs) 기록들을 바탕으로 한 편의 1인칭 자서전 산문을 자동 작성합니다.
 */
async function buildAutobiographyFromQna(chapterName, questions = []) {
  const pureQna = questions.filter(
    (q) => !String(q.question_answer).startsWith('[자서전 완성본]')
  );

  if (pureQna.length === 0) {
    return '';
  }

  // .env에 GEMINI_API_KEY가 있으면 실제 LLM으로 문학적 자서전 생성
  if (process.env.GEMINI_API_KEY) {
    try {
      const historyText = pureQna.map((q) => q.question_answer).join('\n\n');
      const prompt = `다음은 사용자의 자서전 단원 「${chapterName}」에 대한 인터뷰 문답 기록입니다.
${historyText}

위 문답에서 사용자가 대답한 내용을 바탕으로, 1인칭("나") 시점의 따뜻하고 감동적인 자서전 본문(산문 형태, 2~3문단)으로 자연스럽게 엮어서 작성해 주세요.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );
      if (response.ok) {
        const json = await response.json();
        const story = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (story) return story;
      }
    } catch (err) {
      console.warn('[AI Autobiography] Gemini 자서전 생성 실패, 내장 자서전 편집기로 대체합니다:', err.message);
    }
  }

  // 내장 자서전 자동 편집기: Q&A에서 사용자의 답변(A:)들을 추출하여 자연스러운 1인칭 자서전 산문으로 구성
  const answers = pureQna.map((q) => {
    const raw = String(q.question_answer);
    const parts = raw.split(/\nA:\s*/);
    return parts.length > 1 ? parts.slice(1).join(' ').trim() : raw.trim();
  });

  const intro = `『${chapterName}』 — 나의 기억을 돌아보며\n\n`;
  const bodyParagraphs = answers
    .map((ans, idx) => {
      if (idx === 0) return `그 시절을 떠올리면 마음 한켠이 따뜻해진다. ${ans}`;
      if (idx === 1) return `또한 그때의 소중한 인연과 순간들도 잊을 수 없다. ${ans}`;
      if (idx === answers.length - 1 && answers.length > 2) {
        return `돌이켜보면 그 모든 시간들이 지금의 나를 만들었다. ${ans}`;
      }
      return ans;
    })
    .join('\n\n');

  return `${intro}${bodyParagraphs}`;
}

/**
 * 단원 번호(interview_id) 및 질문 번호(question_id) 자동 앞당김 재정렬 헬퍼
 */
function reindexUserInterviews(userId) {
  const userInterviews = store.interviews.filter((i) => i.user_id === userId);
  const idMap = new Map();

  userInterviews.forEach((itv, idx) => {
    const oldId = itv.interview_id;
    const newId = idx + 1;
    idMap.set(oldId, newId);
    itv.interview_id = newId;
  });

  store.interviewQs.forEach((q) => {
    if (idMap.has(q.interview_id)) {
      q.interview_id = idMap.get(q.interview_id);
    }
  });

  seq.interview_id = store.interviews.length + 1;
}

function reindexInterviewQuestions(interviewId) {
  const qs = store.interviewQs.filter((q) => q.interview_id === Number(interviewId));
  qs.forEach((q, idx) => {
    q.question_id = idx + 1;
  });
  seq.question_id = store.interviewQs.length + 1;
}

/**
 * [ITV-01] 1. AI 자서전 인터뷰 단원 생성 (POST /api/interviews)
 * - 대상 테이블 및 필드: interviews (interview_id, user_id, chapter_name, created_at)
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { chapter_name } = req.body || {};

    if (!chapter_name || !String(chapter_name).trim()) {
      throw new HttpError(400, '자서전 단원명(chapter_name)을 입력해 주세요.');
    }

    const trimmedChapter = String(chapter_name).trim();
    if (trimmedChapter.length > 100) {
      throw new HttpError(400, '자서전 단원명(chapter_name)은 100자 이하로 입력해 주세요.');
    }

    const myInterviewCount = store.interviews.filter(
      (i) => i.user_id === req.user.user_id
    ).length;

    const newInterview = {
      interview_id: myInterviewCount + 1,
      user_id: req.user.user_id,
      chapter_name: trimmedChapter,
      created_at: new Date().toISOString(),
    };

    store.interviews.push(newInterview);
    reindexUserInterviews(req.user.user_id);
    saveStoreToDisk();

    const firstAiQuestion = await generateNextAiQuestion(trimmedChapter, []);

    res.status(201).json({
      success: true,
      message: '자서전 단원이 생성되었으며 첫 번째 AI 질문이 준비되었습니다.',
      data: newInterview,
      next_ai_question: firstAiQuestion,
    });
  })
);

/**
 * [ITV-01] 2. 내 자서전 단원 목록 조회 (GET /api/interviews)
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const myInterviews = store.interviews
      .filter((i) => i.user_id === req.user.user_id)
      .sort((a, b) => a.interview_id - b.interview_id);

    res.status(200).json({
      success: true,
      data: myInterviews,
    });
  })
);

/**
 * [ITV-02] 3. 단원별 AI 질문·사용자 답변 기록 저장 & 자서전 자동 갱신 (POST /api/interviews/:interview_id/questions)
 * - 대상 테이블 및 필드: interviewQs (question_id, interview_id, question_answer)
 * - 답변이 추가될 때마다 해당 단원의 문답들을 바탕으로 1인칭 자서전 초안(autobiography_text)을 자동 생성하여 함께 반환합니다.
 */
router.post(
  '/:interview_id/questions',
  asyncHandler(async (req, res) => {
    const interviewId = Number(req.params.interview_id);
    const interview = store.interviews.find(
      (i) => i.interview_id === interviewId && i.user_id === req.user.user_id
    );

    if (!interview) {
      throw new HttpError(404, '해당 자서전 단원(interview_id)을 찾을 수 없습니다.');
    }

    const body = req.body || {};
    const existingQs = store.interviewQs.filter(
      (q) => q.interview_id === interview.interview_id
    );

    let combinedQuestionAnswer = body.question_answer
      ? String(body.question_answer).trim()
      : '';

    if (!combinedQuestionAnswer) {
      const answerText = body.answer ? String(body.answer).trim() : '';
      if (!answerText) {
        throw new HttpError(
          400,
          '질문·답변 기록(question_answer) 또는 사용자 답변(answer)을 입력해 주세요.'
        );
      }
      const questionText =
        body.question && String(body.question).trim()
          ? String(body.question).trim()
          : await generateNextAiQuestion(interview.chapter_name, existingQs);

      combinedQuestionAnswer = `Q: ${questionText}\nA: ${answerText}`;
    }

    const newRecord = {
      question_id: existingQs.length + 1,
      interview_id: interview.interview_id,
      question_answer: combinedQuestionAnswer,
    };

    store.interviewQs.push(newRecord);
    reindexInterviewQuestions(interview.interview_id);
    saveStoreToDisk();

    const updatedQs = store.interviewQs.filter(
      (q) => q.interview_id === interview.interview_id
    );
    const nextAiQuestion = await generateNextAiQuestion(
      interview.chapter_name,
      updatedQs
    );
    const autobiographyText = await buildAutobiographyFromQna(
      interview.chapter_name,
      updatedQs
    );

    res.status(201).json({
      success: true,
      message: 'AI 질문·답변 기록이 저장되었으며 자서전 본문이 자동 생성되었습니다.',
      data: newRecord,
      next_ai_question: nextAiQuestion,
      autobiography_text: autobiographyText,
    });
  })
);

/**
 * [ITV-02] 4. 단원별 질문·답변 기록 및 자동 생성된 자서전 본문 조회 (GET /api/interviews/:interview_id/questions)
 */
const getInterviewQuestionsHandler = asyncHandler(async (req, res) => {
  const interviewId = Number(req.params.interview_id);
  const interview = store.interviews.find(
    (i) => i.interview_id === interviewId && i.user_id === req.user.user_id
  );

  if (!interview) {
    throw new HttpError(404, '해당 자서전 단원(interview_id)을 찾을 수 없습니다.');
  }

  const questions = store.interviewQs
    .filter((q) => q.interview_id === interview.interview_id)
    .sort((a, b) => a.question_id - b.question_id);

  const nextAiQuestion = await generateNextAiQuestion(
    interview.chapter_name,
    questions
  );
  const autobiographyText = await buildAutobiographyFromQna(
    interview.chapter_name,
    questions
  );

  res.status(200).json({
    success: true,
    data: {
      interview_id: interview.interview_id,
      user_id: interview.user_id,
      chapter_name: interview.chapter_name,
      created_at: interview.created_at,
      questions,
      autobiography_text: autobiographyText,
    },
    next_ai_question: nextAiQuestion,
  });
});

router.get('/:interview_id/questions', getInterviewQuestionsHandler);
router.get('/:interview_id', getInterviewQuestionsHandler);

/**
 * [ITV-01] 5. 자서전 단원 삭제 (DELETE /api/interviews/:interview_id)
 */
router.delete(
  '/:interview_id',
  asyncHandler(async (req, res) => {
    const interviewId = Number(req.params.interview_id);
    const index = store.interviews.findIndex(
      (i) => i.interview_id === interviewId && i.user_id === req.user.user_id
    );

    if (index === -1) {
      throw new HttpError(404, '삭제할 자서전 단원을 찾을 수 없습니다.');
    }

    store.interviews.splice(index, 1);
    store.interviewQs = store.interviewQs.filter(
      (q) => q.interview_id !== interviewId
    );

    reindexUserInterviews(req.user.user_id);

    const remaining = store.interviews.filter((i) => i.user_id === req.user.user_id);

    res.status(200).json({
      success: true,
      message: `${interviewId}번 자서전 단원이 삭제되었으며 단원 번호가 순서대로 앞당겨졌습니다.`,
      data: remaining,
    });
  })
);

module.exports = router;
