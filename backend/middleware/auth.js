const jwt = require('jsonwebtoken');
const store = require('../data/store');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret';

// 일반 사용자 인증 + 활동 시각(last_active_at) 자동 갱신
const authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      error: { status: 401, message: '인증 토큰이 필요합니다. (Authorization: Bearer <token>)' },
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type === 'archive') {
      return res.status(403).json({
        success: false,
        error: { status: 403, message: '유족 열람 전용 토큰으로는 접근할 수 없습니다.' },
      });
    }

    const user = store.users.find((u) => u.user_id === payload.sub);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { status: 401, message: '존재하지 않는 사용자입니다.' },
      });
    }

    // [DMS-01] 인증 API 호출 시 마지막 활동 시각 자동 갱신
    user.last_active_at = new Date().toISOString();
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: { status: 401, message: '유효하지 않거나 만료된 토큰입니다.' },
    });
  }
};

// 유족(수신자) 아카이브 전용 토큰 인증
const authenticateArchive = (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      error: { status: 401, message: '유족 열람 토큰이 필요합니다.' },
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'archive') {
      return res.status(403).json({
        success: false,
        error: { status: 403, message: '유효한 유족 아카이브 토큰이 아닙니다.' },
      });
    }

    const user = store.users.find((u) => u.user_id === payload.sub);
    if (!user || !user.is_code_verified || !user.is_transferred) {
      return res.status(403).json({
        success: false,
        error: { status: 403, message: '아카이브 열람 권한이 승인되지 않았습니다.' },
      });
    }

    req.targetUser = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: { status: 401, message: '유효하지 않거나 만료된 유족 토큰입니다.' },
    });
  }
};

module.exports = { authenticate, authenticateArchive, JWT_SECRET };
