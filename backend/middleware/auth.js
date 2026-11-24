const jwt = require('jsonwebtoken');
const { store } = require('../db/store');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * 사용자 인증 미들웨어
 * - 토큰 검증 후 req.user에 로그인한 사용자 객체를 주입합니다.
 */
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

  const user = store.users.find((u) => u.user_id === Number(payload.sub));
  if (!user) {
    throw new HttpError(401, '존재하지 않는 사용자입니다.');
  }

  user.last_active_at = new Date().toISOString();
  req.user = user;
  next();
};

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  HttpError,
  asyncHandler,
  authenticate,
};
