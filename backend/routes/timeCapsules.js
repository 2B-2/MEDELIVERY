const express = require('express');
const store = require('../data/store');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// [CAP-01] ① 타임캡슐 메시지 봉인 (생성)
router.post('/', authenticate, (req, res) => {
  const { title, message, open_date } = req.body || {};

  if (!title || !message || !open_date) {
    return res.status(400).json({
      success: false,
      error: { status: 400, message: '제목(title), 본문(message), 개봉일(open_date)은 모두 필수입니다.' },
    });
  }

  const parsedDate = new Date(open_date);
  if (Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({
      success: false,
      error: { status: 400, message: '유효하지 않은 날짜 형식(open_date)입니다.' },
    });
  }

  const newCapsule = {
    capsule_id: store.seq.capsule_id++,
    user_id: req.user.user_id,
    title: String(title).trim(),
    message: String(message),
    open_date: parsedDate.toISOString(),
    is_opened: false,
  };

  store.time_capsules.push(newCapsule);

  return res.status(201).json({
    success: true,
    message: '타임캡슐이 성공적으로 봉인되었습니다.',
    data: {
      capsule_id: newCapsule.capsule_id,
      user_id: newCapsule.user_id,
      title: newCapsule.title,
      open_date: newCapsule.open_date,
      is_opened: newCapsule.is_opened,
    },
  });
});

// [CAP-02] ② 타임캡슐 목록 조회 (개봉일 미도래 시 message: null 마스킹)
router.get('/', authenticate, (req, res) => {
  const now = new Date();

  const list = store.time_capsules
    .filter((c) => c.user_id === req.user.user_id)
    .map((c) => {
      if (!c.is_opened && now >= new Date(c.open_date)) {
        c.is_opened = true;
      }
      return {
        capsule_id: c.capsule_id,
        user_id: c.user_id,
        title: c.title,
        message: c.is_opened ? c.message : null,
        open_date: c.open_date,
        is_opened: c.is_opened,
      };
    });

  return res.status(200).json({
    success: true,
    data: list,
  });
});

// [CAP-02] ③ 조건부 개봉 제어 및 상세 조회
router.get('/:capsule_id', authenticate, (req, res) => {
  const capsuleId = Number(req.params.capsule_id);
  const capsule = store.time_capsules.find(
    (c) => c.capsule_id === capsuleId && c.user_id === req.user.user_id
  );

  if (!capsule) {
    return res.status(404).json({
      success: false,
      error: { status: 404, message: '해당 타임캡슐을 찾을 수 없습니다.' },
    });
  }

  const now = new Date();
  const canOpen = now >= new Date(capsule.open_date) || req.user.is_transferred;

  if (!canOpen) {
    return res.status(403).json({
      success: false,
      error: {
        status: 403,
        message: `아직 개봉 지정일(${capsule.open_date})이 도래하지 않아 열람할 수 없습니다.`,
        open_date: capsule.open_date,
        is_opened: false,
      },
    });
  }

  capsule.is_opened = true;

  return res.status(200).json({
    success: true,
    message: '타임캡슐이 개봉되었습니다.',
    data: capsule,
  });
});

module.exports = router;
