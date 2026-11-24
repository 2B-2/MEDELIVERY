const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { store, seq, toPublicUser, saveStoreToDisk } = require('../db/store');
const {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  HttpError,
  asyncHandler,
  authenticate,
} = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 10;

/**
 * [ACC-01] 1. 회원가입 (POST /api/auth/signup)
 * - DB 설계서 필드(account_id, password, username, emergency_contact, inactivity_days) 및
 *   프론트엔드 SignupModal 필드(userId, password, name, recipientPhone, deadmanDays) 모두 호환 처리
 */
router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const body = req.body || {};

    // DB 필드명과 프론트엔드 변수명 양방향 매핑
    const rawAccountId = body.account_id ?? body.userId ?? body.email;
    const rawPassword = body.password;
    const rawUsername = body.username ?? body.name;
    const rawEmergencyContact = body.emergency_contact ?? body.recipientPhone ?? '';
    const rawInactivityDays = body.inactivity_days ?? body.deadmanDays ?? 90;

    if (!rawAccountId || !rawPassword) {
      throw new HttpError(400, '로그인 아이디(account_id)와 비밀번호(password)는 필수입니다.');
    }

    const account_id = String(rawAccountId).trim();
    const password = String(rawPassword);
    // 2단계 건너뛰기 시 username이 비어 있으면 account_id를 기본 이름으로 사용 (NOT NULL 보장)
    const username = rawUsername && String(rawUsername).trim() ? String(rawUsername).trim() : account_id;
    const emergency_contact = String(rawEmergencyContact).trim();
    const inactivity_days = Number(rawInactivityDays) > 0 ? Number(rawInactivityDays) : 90;

    if (account_id.length < 2 || account_id.length > 50) {
      throw new HttpError(400, '아이디(account_id)는 2자 이상 50자 이하여야 합니다.');
    }
    if (password.length < 8) {
      throw new HttpError(400, '비밀번호는 8자 이상이어야 합니다.');
    }

    // 중복 아이디 확인
    if (store.users.some((u) => u.account_id === account_id)) {
      throw new HttpError(400, '이미 사용 중인 아이디(account_id)입니다.');
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const now = new Date().toISOString();

    const newUser = {
      user_id: seq.user_id++,
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
    saveStoreToDisk();

    res.status(201).json({
      success: true,
      message: '회원가입이 완료되었습니다.',
      data: toPublicUser(newUser),
      user: toPublicUser(newUser), // 기존 프론트엔드 하위 호환용
    });
  })
);

/**
 * [ACC-01 & DMS-01] 2. 로그인 (POST /api/auth/login)
 * - account_id(또는 프론트의 userId)와 password를 검증하고 JWT 발급
 * - 로그인 성공 시 last_active_at을 현재 시각으로 갱신
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const rawAccountId = body.account_id ?? body.userId ?? body.email;
    const rawPassword = body.password;

    if (!rawAccountId || !rawPassword) {
      throw new HttpError(400, '아이디(account_id)와 비밀번호(password)를 모두 입력해 주세요.');
    }

    const account_id = String(rawAccountId).trim();
    const user = store.users.find((u) => u.account_id === account_id);

    const invalidMessage = '아이디 또는 비밀번호가 올바르지 않습니다.';
    if (!user) {
      throw new HttpError(401, invalidMessage);
    }

    const isMatch = await bcrypt.compare(String(rawPassword), user.password);
    if (!isMatch) {
      throw new HttpError(401, invalidMessage);
    }

    // [DMS-01] 로그인 시 마지막 활동 시각(last_active_at) 갱신
    user.last_active_at = new Date().toISOString();

    const accessToken = jwt.sign(
      { sub: user.user_id, account_id: user.account_id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(200).json({
      success: true,
      message: '로그인에 성공했습니다.',
      accessToken,
      tokenType: 'Bearer',
      expiresIn: JWT_EXPIRES_IN,
      data: toPublicUser(user),
      user: toPublicUser(user),
    });
  })
);

/**
 * [ACC-01] 3. 내 정보 조회 (GET /api/auth/me)
 */
router.get('/me', authenticate, (req, res) => {
  res.status(200).json({
    success: true,
    data: toPublicUser(req.user),
    user: toPublicUser(req.user),
  });
});

/**
 * [ACC-02] 4. 비상 수신자 및 데드맨 스위치 설정 등록/수정
 * - PUT /api/auth/emergency-contact (및 PATCH /api/auth/me 지원)
 */
const updateEmergencyContactHandler = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const user = req.user;

  const newEmergencyContact = body.emergency_contact ?? body.recipientPhone;
  const newInactivityDays = body.inactivity_days ?? body.deadmanDays;
  const newUsername = body.username ?? body.name;

  if (newEmergencyContact !== undefined) {
    user.emergency_contact = String(newEmergencyContact).trim();
  }
  if (newInactivityDays !== undefined) {
    const days = Number(newInactivityDays);
    if (isNaN(days) || days <= 0) {
      throw new HttpError(400, '미접속 기준 일수(inactivity_days)는 1 이상의 숫자여야 합니다.');
    }
    user.inactivity_days = days;
  }
  if (newUsername !== undefined && String(newUsername).trim()) {
    user.username = String(newUsername).trim();
  }

  res.status(200).json({
    success: true,
    message: '비상 수신자 및 데드맨 스위치 설정이 저장되었습니다.',
    data: toPublicUser(user),
  });
});

router.put('/emergency-contact', authenticate, updateEmergencyContactHandler);
router.patch('/me', authenticate, updateEmergencyContactHandler);

module.exports = router;
