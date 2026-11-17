const express = require('express');
const jwt = require('jsonwebtoken');
const store = require('../data/store');
const { authenticateArchive, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const generateAccessCode = () => {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `MDLV-${randomNum}`;
};

// [DMS-01] ① 사용자 활동 갱신 및 미접속 감지 (고유 인증 코드 발급)
router.post('/check', (req, res) => {
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const triggeredUsers = [];

  store.users.forEach((user) => {
    const lastActive = new Date(user.last_active_at);
    const diffDays = Math.floor((now - lastActive) / msPerDay);

    if (diffDays >= user.inactivity_days) {
      if (!user.access_code) {
        let code = generateAccessCode();
        while (store.users.some((u) => u.access_code === code)) {
          code = generateAccessCode();
        }
        user.access_code = code;
        user.code_generated_at = now.toISOString();
      }

      triggeredUsers.push({
        user_id: user.user_id,
        account_id: user.account_id,
        emergency_contact: user.emergency_contact,
        inactivity_days: user.inactivity_days,
        last_active_at: user.last_active_at,
        access_code: user.access_code,
        code_generated_at: user.code_generated_at,
      });
    }
  });

  return res.status(200).json({
    success: true,
    message: '미접속 기준 초과 사용자에 대한 고유 인증 코드가 생성되었습니다.',
    data: triggeredUsers,
  });
});

// [DMS-02] ② 유족(수신자) 고유 코드 인증 및 권한 전달
router.post('/verify', (req, res) => {
  const { access_code } = req.body || {};
  if (!access_code) {
    return res.status(400).json({
      success: false,
      error: { status: 400, message: '고유 인증 코드(access_code)를 입력해 주세요.' },
    });
  }

  const user = store.users.find((u) => u.access_code === String(access_code).trim());
  if (!user) {
    return res.status(401).json({
      success: false,
      error: { status: 401, message: '유효하지 않은 고유 인증 코드입니다.' },
    });
  }

  user.is_code_verified = true;
  user.is_transferred = true;

  const archiveToken = jwt.sign(
    { sub: user.user_id, type: 'archive' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.status(200).json({
    success: true,
    message: '유족 고유 코드 인증이 완료되어 아카이브 권한이 전달되었습니다.',
    archiveToken,
    data: {
      user_id: user.user_id,
      username: user.username,
      code_generated_at: user.code_generated_at,
      is_code_verified: user.is_code_verified,
      is_transferred: user.is_transferred,
    },
  });
});

// [DMS-02] ③ 유족 아카이브 통합 조회 (일기 + 자서전 + 타임캡슐)
router.get('/archive', authenticateArchive, (req, res) => {
  const userId = req.targetUser.user_id;

  const userDiaries = store.diaries.filter((d) => d.user_id === userId);
  const userInterviews = store.interviews
    .filter((i) => i.user_id === userId)
    .map((interview) => ({
      ...interview,
      questions: store.interviewQs.filter((q) => q.interview_id === interview.interview_id),
    }));

  // 권한이 전달된 유족에게는 타임캡슐 봉인 해제 상태로 전체 열람 허용
  const userCapsules = store.time_capsules
    .filter((c) => c.user_id === userId)
    .map((c) => ({ ...c, is_opened: true }));

  return res.status(200).json({
    success: true,
    data: {
      user: {
        user_id: req.targetUser.user_id,
        username: req.targetUser.username,
        is_transferred: req.targetUser.is_transferred,
      },
      diaries: userDiaries,
      interviews: userInterviews,
      time_capsules: userCapsules,
    },
  });
});

module.exports = router;
