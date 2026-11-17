require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 유빈님 공통 데이터 저장소 및 미들웨어 연결
const store = require('../data/store');
const authMod = require('../middleware/auth');
const authMiddleware =
  typeof authMod === 'function'
    ? authMod
    : authMod.authMiddleware || authMod.authenticateToken || Object.values(authMod)[0];

// 유빈님 도메인 라우터 연결
const deadmanRouter = require('../routes/deadman');
const diariesRouter = require('../routes/diaries');
const interviewsRouter = require('../routes/interviews');
const timeCapsulesRouter = require('../routes/timeCapsules');

const app = express();
const PORT = process.env.PORT || 3000;
// 토큰 비밀키를 미들웨어와 완벽하게 일치시킴
const JWT_SECRET = authMod.JWT_SECRET || process.env.JWT_SECRET || 'medelivery-secret-key';

app.use(cors());
app.use(express.json());

// ==========================================
// 1. 회원 인증 (팀원 server.js + 명세서 v2.0 통합)
// ==========================================

// 아이디 중복 확인
app.get('/api/auth/check-id', (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ success: false, message: '아이디를 입력해주세요.' });
  }
  const exists = store.users.some((u) => u.userId === userId);
  return res.json({ success: true, available: !exists });
});

// 회원가입 (데드맨 스위치 초기 필드 자동 생성 포함)
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { userId, password, name, phone, recipientName, recipientPhone, deadmanDays } = req.body;

    if (!userId || !password || !name) {
      return res.status(400).json({
        success: false,
        error: { status: 400, message: '아이디, 비밀번호, 이름은 필수 입력 항목입니다.' },
      });
    }

    if (store.users.some((u) => u.userId === userId)) {
      return res.status(409).json({
        success: false,
        error: { status: 409, message: '이미 사용 중인 아이디입니다.' },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    const newUser = {
      id: `user_${Date.now()}`,
      userId,
      password: hashedPassword,
      name,
      phone: phone || '',
      // 데드맨 스위치 및 명세서 v2.0 필수 필드 연동
      inactivity_days: Number(deadmanDays) || 90,
      last_active_at: now,
      is_deceased: false,
      emergency_contact: recipientPhone
        ? {
            name: recipientName || '비상 수신자',
            phone: recipientPhone,
            relationship: '가족/지인',
          }
        : null,
      access_code: null,
      code_generated_at: null,
      created_at: now,
    };

    store.users.push(newUser);

    const token = jwt.sign({ id: newUser.id, userId: newUser.userId }, JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.status(201).json({
      success: true,
      message: '회원가입이 완료되었습니다.',
      token,
      user: {
        id: newUser.id,
        userId: newUser.userId,
        name: newUser.name,
        inactivity_days: newUser.inactivity_days,
        emergency_contact: newUser.emergency_contact,
      },
    });
  } catch (err) {
    console.error('[회원가입 오류]', err);
    return res.status(500).json({ success: false, message: '회원가입 처리 중 오류가 발생했습니다.' });
  }
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
  try {
    const { userId, password } = req.body;
    const user = store.users.find((u) => u.userId === userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { status: 401, message: '아이디 또는 비밀번호가 일치하지 않습니다.' },
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { status: 401, message: '아이디 또는 비밀번호가 일치하지 않습니다.' },
      });
    }

    // 로그인 시 활동 시각 갱신
    user.last_active_at = new Date().toISOString();

    const token = jwt.sign({ id: user.id, userId: user.userId }, JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        userId: user.userId,
        name: user.name,
        inactivity_days: user.inactivity_days,
        last_active_at: user.last_active_at,
        emergency_contact: user.emergency_contact,
      },
    });
  } catch (err) {
    console.error('[로그인 오류]', err);
    return res.status(500).json({ success: false, message: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

// 내 정보 조회 (토큰 인증 필요)
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = req.user;
  return res.json({
    success: true,
    user: {
      id: user.id,
      userId: user.userId,
      name: user.name,
      phone: user.phone,
      inactivity_days: user.inactivity_days,
      last_active_at: user.last_active_at,
      is_deceased: user.is_deceased,
      emergency_contact: user.emergency_contact,
    },
  });
});

// 비상 수신자 설정/수정 (명세서 v2.0)
app.put('/api/auth/emergency-contact', authMiddleware, (req, res) => {
  const { name, phone, relationship } = req.body;
  if (!name || !phone) {
    return res.status(400).json({
      success: false,
      error: { status: 400, message: '수신자 이름과 연락처는 필수입니다.' },
    });
  }

  req.user.emergency_contact = {
    name,
    phone,
    relationship: relationship || '가족/지인',
  };

  return res.json({
    success: true,
    emergency_contact: req.user.emergency_contact,
  });
});

// ==========================================
// 2. 유빈님 4대 핵심 도메인 라우터 연결
// ==========================================
app.use('/api/deadman', deadmanRouter);
app.use('/api/diaries', diariesRouter);
app.use('/api/interviews', interviewsRouter);
app.use('/api/time-capsules', timeCapsulesRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: 'v2.0-integrated' });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { status: 404, message: '요청한 API 경로를 찾을 수 없습니다.' },
  });
});

app.listen(PORT, () => {
  console.log(`MEDELIVERY 통합 백엔드 서버 실행 중: http://localhost:${PORT}`);
});