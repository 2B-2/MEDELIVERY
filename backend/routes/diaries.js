const express = require('express');
const { store, seq, saveStoreToDisk } = require('../db/store');
const { HttpError, asyncHandler, authenticate } = require('../middleware/auth');

const router = express.Router();

// 모든 일기장 API는 로그인 인증 필요 (호출 시 last_active_at 자동 갱신)
router.use(authenticate);

// 한국 시간(KST) 기준 YYYY-MM-DD 날짜 문자열 추출 헬퍼
function toDateString(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr).slice(0, 10);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 일기 번호(diary_id) 재정렬 헬퍼
 * - 중간 번호(예: 2번) 일기가 삭제되면 뒤에 있던 일기들의 번호(diary_id)를 1부터 빈틈없이 하나씩 앞당깁니다.
 * - 다음 생성될 일기 번호(seq.diary_id)도 현재 마지막 일기 번호 + 1로 자동 조정합니다.
 */
function reindexUserDiaries(userId) {
  // 해당 사용자의 일기들을 작성 순서대로 1번부터 다시 번호 부여
  const userDiaries = store.diaries.filter((d) => d.user_id === userId);
  userDiaries.forEach((diary, idx) => {
    diary.diary_id = idx + 1;
  });
  // 다음 일기 번호 시퀀스도 현재 일기 개수 + 1로 맞춤
  seq.diary_id = userDiaries.length + 1;
}

/**
 * [MEM-01] 1. 일기 작성 및 저장 (POST /api/diaries)
 * - 대상 테이블 및 필드: diaries (diary_id, user_id, title, content, created_at)
 * - 작성 시 적은 제목(title) 그대로 저장, 수정 날짜(updated_at)는 사용하지 않음
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title, content, created_at } = req.body || {};

    if (!title || !content || !String(title).trim() || !String(content).trim()) {
      throw new HttpError(400, '일기 제목(title)과 본문(content)을 모두 입력해 주세요.');
    }

    const trimmedTitle = String(title).trim();
    if (trimmedTitle.length > 200) {
      throw new HttpError(400, '일기 제목(title)은 200자 이하로 입력해 주세요.');
    }

    let createdAtIso = new Date().toISOString();
    if (created_at) {
      const parsed = new Date(created_at);
      if (!isNaN(parsed.getTime())) {
        createdAtIso = parsed.toISOString();
      }
    }

    const myDiaryCount = store.diaries.filter((d) => d.user_id === req.user.user_id).length;

    // DB 설계서 5개 컬럼 엄격 준수: diary_id, user_id, title, content, created_at
    const newDiary = {
      diary_id: myDiaryCount + 1,
      user_id: req.user.user_id,
      title: trimmedTitle,
      content: String(content).trim(),
      created_at: createdAtIso,
    };

    store.diaries.push(newDiary);
    reindexUserDiaries(req.user.user_id);
    saveStoreToDisk();

    res.status(201).json({
      success: true,
      message: '일기가 저장되었습니다.',
      data: newDiary,
    });
  })
);

/**
 * [MEM-02] 2. 내 일기 목록 조회 - 날짜별 보기 지원 (GET /api/diaries)
 * - 쿼리 파라미터 없이 호출 시: 전체 내 일기를 반환
 * - ?date=YYYY-MM-DD (또는 ?date=YYYY-MM) 전달 시: 해당 날짜(또는 월)에 작성된 일기만 필터링하여 반환
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { date } = req.query || {};

    let myDiaries = store.diaries.filter((d) => d.user_id === req.user.user_id);

    // 날짜별 보기 필터링 (?date=2026-11-17 또는 ?date=2026-11)
    if (date && String(date).trim()) {
      const filterDate = String(date).trim();
      myDiaries = myDiaries.filter((d) => {
        const diaryDate = toDateString(d.created_at);
        return diaryDate.startsWith(filterDate) || String(d.created_at).startsWith(filterDate);
      });
    }

    // 일기 번호(diary_id) 순서대로 정렬
    myDiaries.sort((a, b) => a.diary_id - b.diary_id);

    res.status(200).json({
      success: true,
      data: myDiaries,
    });
  })
);

/**
 * [MEM-02] 3. 일기 상세 조회 (GET /api/diaries/:diary_id)
 */
router.get(
  '/:diary_id',
  asyncHandler(async (req, res) => {
    const diaryId = Number(req.params.diary_id);
    const diary = store.diaries.find(
      (d) => d.diary_id === diaryId && d.user_id === req.user.user_id
    );

    if (!diary) {
      throw new HttpError(404, '해당 일기를 찾을 수 없습니다.');
    }

    res.status(200).json({
      success: true,
      data: diary,
    });
  })
);

/**
 * [MEM-02] 4. 일기 수정 (PUT /api/diaries/:diary_id)
 * - 수정 날짜(updated_at)는 따로 기록하거나 표기하지 않고 최초 작성일(created_at)만 그대로 유지
 */
router.put(
  '/:diary_id',
  asyncHandler(async (req, res) => {
    const diaryId = Number(req.params.diary_id);
    const diary = store.diaries.find(
      (d) => d.diary_id === diaryId && d.user_id === req.user.user_id
    );

    if (!diary) {
      throw new HttpError(404, '수정할 일기를 찾을 수 없습니다.');
    }

    const { title, content } = req.body || {};

    if (title !== undefined) {
      const trimmedTitle = String(title).trim();
      if (!trimmedTitle) {
        throw new HttpError(400, '일기 제목(title)은 비워둘 수 없습니다.');
      }
      if (trimmedTitle.length > 200) {
        throw new HttpError(400, '일기 제목(title)은 200자 이하로 입력해 주세요.');
      }
      diary.title = trimmedTitle;
    }

    if (content !== undefined) {
      const trimmedContent = String(content).trim();
      if (!trimmedContent) {
        throw new HttpError(400, '일기 본문(content)은 비워둘 수 없습니다.');
      }
      diary.content = trimmedContent;
    }

    res.status(200).json({
      success: true,
      message: '일기가 수정되었습니다.',
      data: diary,
    });
  })
);

/**
 * [MEM-02] 5. 일기 삭제 (DELETE /api/diaries/:diary_id)
 * - 삭제 후 남아 있는 일기들의 번호(diary_id)를 1번부터 하나씩 앞당겨 자동 재정렬합니다.
 */
router.delete(
  '/:diary_id',
  asyncHandler(async (req, res) => {
    const diaryId = Number(req.params.diary_id);
    const index = store.diaries.findIndex(
      (d) => d.diary_id === diaryId && d.user_id === req.user.user_id
    );

    if (index === -1) {
      throw new HttpError(404, '삭제할 일기를 찾을 수 없습니다.');
    }

    store.diaries.splice(index, 1);

    // 중간 일기 삭제 시 뒤의 일기 번호들을 하나씩 앞당김
    reindexUserDiaries(req.user.user_id);

    const remainingDiaries = store.diaries.filter((d) => d.user_id === req.user.user_id);

    res.status(200).json({
      success: true,
      message: `${diaryId}번 일기가 삭제되었으며, 전체 일기 번호가 순서대로 앞당겨졌습니다.`,
      data: remainingDiaries,
    });
  })
);

module.exports = router;
