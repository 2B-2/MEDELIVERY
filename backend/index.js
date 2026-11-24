require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const { HttpError } = require('./middleware/auth');

const authRouter = require('./routes/auth');
const diariesRouter = require('./routes/diaries');
const interviewsRouter = require('./routes/interviews');
const {
  router: deadmanRouter,
  processDeadmanSwitchLifecycle,
} = require('./routes/deadman');
const {
  store,
  seq,
  saveStoreToDisk,
  resetStore,
  getMysqlStatus,
} = require('./db/store');
const {
  verifySqlCompatibilityDryRun,
  testAndConnectLiveMysql,
  queryAllMysqlTablesDirectly,
} = require('./db/mysql');
const {
  router: timeCapsulesRouter,
  processTimeCapsuleLifecycle,
} = require('./routes/timeCapsules');

const app = express();
const PORT = process.env.PORT || 4000;

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : true;

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// 모든 데이터 변경 요청(POST, PUT, PATCH, DELETE) 완료 시 자동으로 로컬 파일(data.json)에 저장
app.use((req, res, next) => {
  res.on('finish', () => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      saveStoreToDisk();
    }
  });
  next();
});

/* ------------------------------------------------------------------ */
/* 구현된 API 라우트 등록                                              */
/* ------------------------------------------------------------------ */
// 1. 회원가입 및 로그인 (/api/auth)
app.use('/api/auth', authRouter);

// 2. 고인 다이어리 - 일기장 (/api/diaries)
app.use('/api/diaries', diariesRouter);

// 3. AI 자서전 인터뷰 (/api/interviews)
app.use('/api/interviews', interviewsRouter);

// 4. 타임캡슐 (/api/time-capsules)
app.use('/api/time-capsules', timeCapsulesRouter);

// 5. 데드맨 스위치 및 유족 통합 아카이브 전달 (/api/deadman)
app.use('/api/deadman', deadmanRouter);

// 헬스체크
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'MEDELIVERY Backend API' });
});

// 현재 디스크(.medelivery-data.json) 또는 AWS RDS(MySQL)에 저장된 전체 데이터 요약 조회
app.get('/api/store-status', (req, res) => {
  res.status(200).json({
    success: true,
    db: getMysqlStatus(),
    counts: {
      users: store.users.length,
      diaries: store.diaries.length,
      interviews: store.interviews.length,
      interviewQs: store.interviewQs.length,
      time_capsules: store.time_capsules.length,
    },
    users: store.users.map((u) => ({
      user_id: u.user_id,
      account_id: u.account_id,
      username: u.username,
      emergency_contact: u.emergency_contact,
      created_at: u.created_at,
    })),
  });
});

// 테스트용 전체 데이터 1초 초기화 API (POST /api/reset-store)
app.post('/api/reset-store', (req, res) => {
  resetStore();
  res.status(200).json({
    success: true,
    message: '모든 로컬 저장 데이터(data.json)가 초기 상태로 깨끗하게 리셋되었습니다.',
  });
});

// [AWS RDS / MySQL 연동 전 사전 검증 (Dry-Run) API]
// MySQL 설치나 AWS RDS 생성 전에도 5개 테이블 스키마, FK 무결성, 실제 실행될 SQL INSERT 쿼리를 검증합니다.
app.get('/api/db/dry-run', (req, res) => {
  const report = verifySqlCompatibilityDryRun(store);
  res.status(200).json({
    success: true,
    message: report.ready_for_aws_rds
      ? 'AWS RDS (MySQL) 5개 테이블 스키마 및 현재 데이터 SQL 호환성 사전 검증(Dry-Run)을 100% 통과했습니다!'
      : '스키마 또는 데이터 무결성 확인이 필요합니다.',
    report,
  });
});

// [실제 AWS RDS / MySQL 연결 테스트 및 5개 테이블 즉시 자동 생성 API]
app.post('/api/db/test-connect', async (req, res, next) => {
  try {
    const { host, port, user, password, database } = req.body || {};
    const result = await testAndConnectLiveMysql(
      { host, port, user, password, database },
      store,
      seq
    );
    res.status(200).json({
      success: true,
      message: `AWS RDS / MySQL(${result.host}) 연결 및 5개 테이블 구축·동기화 완료!`,
      data: result,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { status: 400, message: err.message },
    });
  }
});

// [실제 AWS RDS / MySQL 5개 테이블에 직접 SELECT * 쿼리를 날려 실시간 DB 데이터 확인]
app.get('/api/db/live-tables', async (req, res) => {
  try {
    const liveData = await queryAllMysqlTablesDirectly();
    res.status(200).json({
      success: true,
      message: 'AWS RDS (MySQL) 5개 테이블 실시간 직접 조회(SELECT *) 결과입니다.',
      data: liveData,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: { status: 400, message: err.message },
    });
  }
});
app.get(['/', '/test'], (req, res) => {
  res.sendFile(path.join(__dirname, 'test.html'));
});

// 수신자 전용 타임캡슐 6자리 보안 초대 코드 입력 & PDF 다운로드 페이지 (/capsule-view)
app.get('/capsule-view', (req, res) => {
  res.sendFile(path.join(__dirname, 'capsule-view.html'));
});

// .env 설정 없이 발송된 이메일 원본을 브라우저에서 바로 확인하는 내장 웹 메일함 뷰어 (/email-preview/:id)
app.get('/email-preview/:id', (req, res) => {
  const notif = store.notifications.find(
    (n) => n.notification_id === Number(req.params.id)
  );
  if (!notif) {
    return res.status(404).send('<h3>발송된 이메일 내역을 찾을 수 없습니다.</h3>');
  }
  res.send(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8" />
      <title>[받은편지함 미리보기] ${notif.capsule_title}</title>
      <style>
        body { margin: 0; background: #E9E4DC; font-family: 'Malgun Gothic', sans-serif; padding: 28px; }
        .mail-header { max-width: 600px; margin: 0 auto 16px; background: #fff; border-radius: 12px; padding: 16px 22px; border: 1px solid #D8CFC2; font-size: 13px; line-height: 1.7; color: #2C221A; }
        .badge { background: #2E7D32; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
      </style>
    </head>
    <body>
      <div class="mail-header">
        <div><span class="badge">받은편지함 (No-.env 테스트 메일뷰어)</span></div>
        <div><strong>보낸사람:</strong> MEDELIVERY &lt;no-reply@medelivery.kr&gt;</div>
        <div><strong>받는사람:</strong> ${notif.recipient_contact}</div>
        <div><strong>발송시각:</strong> ${new Date(notif.sent_at).toLocaleString('ko-KR')}</div>
        <div><strong>제목:</strong> [MEDELIVERY] ${notif.author_name}님이 남기신 타임캡슐("${notif.capsule_title}") 개봉일이 도래했습니다.</div>
      </div>
      ${notif.email_html}
    </body>
    </html>
  `);
});

/* ------------------------------------------------------------------ */
/* 자동 스케줄러 (10초마다 타임캡슐 개봉일 & 데드맨 스위치 미접속 감지 및 이메일 발송) */
/* ------------------------------------------------------------------ */
setInterval(() => {
  processTimeCapsuleLifecycle(`http://localhost:${PORT}`);
  processDeadmanSwitchLifecycle(`http://localhost:${PORT}`);
}, 10 * 1000);

/* ------------------------------------------------------------------ */
/* 공통 에러 처리                                                      */
/* ------------------------------------------------------------------ */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { status: 404, message: '요청한 API 경로를 찾을 수 없습니다.' },
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { status: 400, message: '요청 본문이 올바른 JSON 형식이 아닙니다.' },
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      error: { status: err.status, message: err.message },
    });
  }

  console.error('[MEDELIVERY 서버 오류]', err);
  res.status(500).json({
    success: false,
    error: { status: 500, message: '서버 내부 오류가 발생했습니다.' },
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MEDELIVERY API 서버 실행 중: http://localhost:${PORT}`);
  });
}

module.exports = app;
