require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRouter = require('./routes/auth');
const deadmanRouter = require('./routes/deadman');
const diariesRouter = require('./routes/diaries');
const interviewsRouter = require('./routes/interviews');
const timeCapsulesRouter = require('./routes/timeCapsules');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 명세서 v2.0 라우터 매핑
app.use('/api/auth', authRouter);
app.use('/api/deadman', deadmanRouter);
app.use('/api/diaries', diariesRouter);
app.use('/api/interviews', interviewsRouter);
app.use('/api/time-capsules', timeCapsulesRouter);

// 헬스 체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: 'v2.0' });
});

// 404 처리
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { status: 404, message: '요청한 API 경로를 찾을 수 없습니다.' },
  });
});

// 전역 에러 핸들러
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { status: 400, message: '요청 본문이 올바른 JSON 형식이 아닙니다.' },
    });
  }
  console.error('[서버 오류]', err);
  return res.status(500).json({
    success: false,
    error: { status: 500, message: '서버 내부 오류가 발생했습니다.' },
  });
});

app.listen(PORT, () => {
  console.log(`MEDELIVERY 백엔드 서버(v2.0) 실행 중: http://localhost:${PORT}`);
  console.log(`- [ACC-01~02] 회원/비상수신자 API : http://localhost:${PORT}/api/auth`);
  console.log(`- [DMS-01~02] 데드맨/유족인증 API : http://localhost:${PORT}/api/deadman`);
  console.log(`- [MEM-01~02] 고인 다이어리 API   : http://localhost:${PORT}/api/diaries`);
  console.log(`- [ITV-01~02] AI 자서전 API       : http://localhost:${PORT}/api/interviews`);
  console.log(`- [CAP-01~02] 타임캡슐 API        : http://localhost:${PORT}/api/time-capsules`);
});
