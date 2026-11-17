const express = require('express');
const store = require('../data/store');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// [MEM-01] ① 일기 작성 및 저장
router.post('/', authenticate, (req, res) => {
  const { title, content } = req.body || {};

  if (!title || !content) {
    return res.status(400).json({
      success: false,
      error: { status: 400, message: '일기 제목(title)과 본문(content)은 필수입니다.' },
    });
  }

  const newDiary = {
    diary_id: store.seq.diary_id++,
    user_id: req.user.user_id,
    title: String(title).trim(),
    content: String(content),
    created_at: new Date().toISOString(),
  };

  store.diaries.push(newDiary);

  return res.status(201).json({
    success: true,
    message: '일기가 저장되었습니다.',
    data: newDiary,
  });
});

// [MEM-02] ② 일기 목록 조회
router.get('/', authenticate, (req, res) => {
  const myDiaries = store.diaries.filter((d) => d.user_id === req.user.user_id);
  return res.status(200).json({
    success: true,
    data: myDiaries,
  });
});

// [MEM-02] ③ 일기 상세 조회
router.get('/:diary_id', authenticate, (req, res) => {
  const diaryId = Number(req.params.diary_id);
  const diary = store.diaries.find(
    (d) => d.diary_id === diaryId && d.user_id === req.user.user_id
  );

  if (!diary) {
    return res.status(404).json({
      success: false,
      error: { status: 404, message: '해당 일기를 찾을 수 없습니다.' },
    });
  }

  return res.status(200).json({
    success: true,
    data: diary,
  });
});

// [MEM-02] ④ 일기 수정
router.put('/:diary_id', authenticate, (req, res) => {
  const diaryId = Number(req.params.diary_id);
  const diary = store.diaries.find(
    (d) => d.diary_id === diaryId && d.user_id === req.user.user_id
  );

  if (!diary) {
    return res.status(404).json({
      success: false,
      error: { status: 404, message: '수정할 일기를 찾을 수 없습니다.' },
    });
  }

  const { title, content } = req.body || {};
  if (title !== undefined) diary.title = String(title).trim();
  if (content !== undefined) diary.content = String(content);

  return res.status(200).json({
    success: true,
    message: '일기가 수정되었습니다.',
    data: diary,
  });
});

// [MEM-02] ⑤ 일기 삭제
router.delete('/:diary_id', authenticate, (req, res) => {
  const diaryId = Number(req.params.diary_id);
  const index = store.diaries.findIndex(
    (d) => d.diary_id === diaryId && d.user_id === req.user.user_id
  );

  if (index === -1) {
    return res.status(404).json({
      success: false,
      error: { status: 404, message: '삭제할 일기를 찾을 수 없습니다.' },
    });
  }

  store.diaries.splice(index, 1);

  return res.status(200).json({
    success: true,
    message: '일기가 삭제되었습니다.',
  });
});

module.exports = router;
