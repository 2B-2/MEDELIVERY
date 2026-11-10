require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

/* ------------------------------------------------------------------ */
/* 설정                                                                */
/* ------------------------------------------------------------------ */
const PORT = process.env.PORT || 4000;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const SALT_ROUNDS = 10;

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = 'dev-only-insecure-secret';
  console.warn(
    '[경고] JWT_SECRET 환경 변수가 없습니다. 개발용 기본 키를 사용합니다. 운영 환경에서는 반드시 설정하세요.'
  );
}

// CORS_ORIGIN 미설정 시 모든 origin 허용 (쉼표로 여러 개 지정 가능)
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : true;

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

/* ------------------------------------------------------------------ */
/* In-Memory DB (서버 재시작 시 초기화됩니다)                             */
/* ------------------------------------------------------------------ */
const users = [];
let nextUserId = 1;

const findUserByEmail = (email) => users.find((u) => u.email === email);
const findUserById = (id) => users.find((u) => u.id === id);

// 비밀번호 해시를 제외한 공개용 사용자 정보
const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  createdAt: user.createdAt,
});

/* ------------------------------------------------------------------ */
/* 유틸                                                                */
/* ------------------------------------------------------------------ */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (email) => String(email).trim().toLowerCase();

// async 핸들러의 에러를 전역 에러 핸들러로 전달
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* ------------------------------------------------------------------ */
/* 인증 미들웨어                                                        */
/* ------------------------------------------------------------------ */
const authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, '인증 토큰이 필요합니다. (Authorization: Bearer <token>)');
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new HttpError(401, '토큰이 만료되었습니다. 다시 로그인해 주세요.');
    }
    throw new HttpError(401, '유효하지 않은 토큰입니다.');
  }

  const user = findUserById(payload.sub);
  if (!user) {
    throw new HttpError(401, '존재하지 않는 사용자입니다.');
  }

  req.user = user;
  next();
};

/* ------------------------------------------------------------------ */
/* 라우트                                                              */
/* ------------------------------------------------------------------ */
const authRouter = express.Router();

// 1. 회원가입
authRouter.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body || {};

    if (!email || !password || !name) {
      throw new HttpError(400, 'email, password, name은 모두 필수입니다.');
    }
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof name !== 'string'
    ) {
      throw new HttpError(400, 'email, password, name은 문자열이어야 합니다.');
    }

    const normalizedEmail = normalizeEmail(email);
    const trimmedName = name.trim();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new HttpError(400, '올바른 이메일 형식이 아닙니다.');
    }
    if (password.length < 8) {
      throw new HttpError(400, '비밀번호는 8자 이상이어야 합니다.');
    }
    if (trimmedName.length < 1 || trimmedName.length > 30) {
      throw new HttpError(400, '이름은 1자 이상 30자 이하여야 합니다.');
    }

    // 이메일 중복 확인
    if (findUserByEmail(normalizedEmail)) {
      throw new HttpError(400, '이미 가입된 이메일입니다.');
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const newUser = {
      id: nextUserId++,
      email: normalizedEmail,
      password: hashedPassword,
      name: trimmedName,
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);

    res.status(201).json({
      message: '회원가입이 완료되었습니다.',
      user: toPublicUser(newUser),
    });
  })
);

// 2. 로그인
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      throw new HttpError(400, 'email과 password는 필수입니다.');
    }
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new HttpError(400, 'email과 password는 문자열이어야 합니다.');
    }

    const user = findUserByEmail(normalizeEmail(email));

    // 이메일/비밀번호 어느 쪽이 틀렸는지 노출하지 않도록 동일한 메시지 사용
    const invalidMessage = '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (!user) {
      throw new HttpError(401, invalidMessage);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new HttpError(401, invalidMessage);
    }

    const accessToken = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.status(200).json({
      message: '로그인에 성공했습니다.',
      accessToken,
      tokenType: 'Bearer',
      expiresIn: JWT_EXPIRES_IN,
      user: toPublicUser(user),
    });
  })
);

// 3. 내 정보 조회
authRouter.get('/me', authenticate, (req, res) => {
  res.status(200).json({ user: toPublicUser(req.user) });
});

app.use('/api/auth', authRouter);

// 헬스체크
app.get('/health', (req, res) => res.json({ status: 'ok' }));

/* ------------------------------------------------------------------ */
/* 에러 처리                                                           */
/* ------------------------------------------------------------------ */
// 존재하지 않는 경로
app.use((req, res) => {
  res.status(404).json({ error: { status: 404, message: '요청한 경로를 찾을 수 없습니다.' } });
});

// 전역 에러 핸들러 (400 / 401 / 500)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // JSON 파싱 실패
  if (err.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ error: { status: 400, message: '요청 본문이 올바른 JSON 형식이 아닙니다.' } });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { status: err.status, message: err.message } });
  }

  console.error('[서버 오류]', err);
  res
    .status(500)
    .json({ error: { status: 500, message: '서버 내부 오류가 발생했습니다.' } });
});

/* ------------------------------------------------------------------ */
app.listen(PORT, () => {
  console.log(`온기록 API 서버 실행 중: http://localhost:${PORT}`);
});
