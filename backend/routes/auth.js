const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('../data/store');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const SALT_ROUNDS = 10;

const toPublicUser = (u) => ({
  user_id: u.user_id,
  account_id: u.account_id,
  username: u.username,
  emergency_contact: u.emergency_contact,
  inactivity_days: u.inactivity_days,
  last_active_at: u.last_active_at,
  is_code_verified: u.is_code_verified,
  is_transferred: u.is_transferred,
  created_at: u.created_at,
});

// [ACC-01] ① 회원가입
router.post('/signup', async (req, res) => {
  try {
    const body = req.body || {};
    // 프론트엔드(userId, name, recipientPhone, deadmanDays) & DB명세(account_id, username, emergency_contact, inactivity_days) 동시 지원
    const account_id = String(body.account_id || body.userId || '').trim();
    const password = String(body.password || '');
    const rawUsername = body.username !== undefined ? body.username : body.name;
    const username = rawUsername && String(rawUsername).trim() ? String(rawUsername).trim() : account_id;
    const rawContact = body.emergency_contact !== undefined ? body.emergency_contact : body.recipientPhone;
    const emergency_contact = rawContact ? String(rawContact).trim() : '';
    const rawDays = body.inactivity_days !== undefined ? body.inactivity_days : body.deadmanDays;
    const inactivity_days = Number(rawDays) > 0 ? Number(rawDays) : 90;

    if (!account_id || !password) {
      return res.status(400).json({
        success: false,
        error: { status: 400, message: 'account_id(또는 userId)와 password는 필수입니다.' },
      });
    }

    if (store.users.some((u) => u.account_id === account_id)) {
      return res.status(400).json({
        success: false,
        error: { status: 400, message: '이미 사용 중인 아이디입니다.' },
      });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const now = new Date().toISOString();

    const newUser = {
      user_id: store.seq.user_id++,
      account_id,
      password: hashedPassword,
      username,
      emergency_contact,
      inactivity_days,
      last_active_at: now,
      access_code: null,
      code_generated_at: null,
      is_code_verified: false,
      is_transferred: false,
      created_at: now,
    };

    store.users.push(newUser);

    return res.status(201).json({
      success: true,
      message: '회원가입이 완료되었습니다.',
      data: toPublicUser(newUser),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { status: 500, message: '회원가입 처리 중 오류가 발생했습니다.' },
    });
  }
});

// [ACC-01] ② 로그인
router.post('/login', async (req, res) => {
  try {
    const body = req.body || {};
    const account_id = String(body.account_id || body.userId || '').trim();
    const password = String(body.password || '');

    if (!account_id || !password) {
      return res.status(400).json({
        success: false,
        error: { status: 400, message: '아이디와 비밀번호를 모두 입력해 주세요.' },
      });
    }

    const user = store.users.find((u) => u.account_id === account_id);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        success: false,
        error: { status: 401, message: '아이디 또는 비밀번호가 올바르지 않습니다.' },
      });
    }

    // [DMS-01] 로그인 시 마지막 활동 시각 갱신
    user.last_active_at = new Date().toISOString();

    const accessToken = jwt.sign(
      { sub: user.user_id, account_id: user.account_id, type: 'user' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      success: true,
      message: '로그인에 성공했습니다.',
      accessToken,
      tokenType: 'Bearer',
      expiresIn: JWT_EXPIRES_IN,
      data: {
        user_id: user.user_id,
        account_id: user.account_id,
        username: user.username,
        emergency_contact: user.emergency_contact,
        inactivity_days: user.inactivity_days,
        last_active_at: user.last_active_at,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { status: 500, message: '로그인 처리 중 오류가 발생했습니다.' },
    });
  }
});

// [ACC-01] ③ 내 정보 조회
router.get('/me', authenticate, (req, res) => {
  return res.status(200).json({
    success: true,
    data: toPublicUser(req.user),
  });
});

// [ACC-02] ④ 비상 수신자 및 데드맨 설정 등록/수정
router.put('/emergency-contact', authenticate, (req, res) => {
  const { emergency_contact, inactivity_days, username } = req.body || {};

  if (emergency_contact !== undefined) {
    req.user.emergency_contact = String(emergency_contact).trim();
  }
  if (inactivity_days !== undefined && Number(inactivity_days) > 0) {
    req.user.inactivity_days = Number(inactivity_days);
  }
  if (username !== undefined && String(username).trim()) {
    req.user.username = String(username).trim();
  }

  return res.status(200).json({
    success: true,
    message: '비상 수신자 및 미접속 기준 일수가 저장되었습니다.',
    data: {
      user_id: req.user.user_id,
      account_id: req.user.account_id,
      username: req.user.username,
      emergency_contact: req.user.emergency_contact,
      inactivity_days: req.user.inactivity_days,
      last_active_at: req.user.last_active_at,
    },
  });
});

module.exports = router;
