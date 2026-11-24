/**
 * MEDELIVERY 데이터 저장소 (로컬 파일 자동 저장 & 복원 지원)
 * - node --watch (npm run dev)가 저장 파일 변경 때문에 서버를 재시작하지 않도록
 *   프로젝트 최상위(C:\MEDELIVERY-main\.medelivery-data.json)에 저장합니다.
 */

const fs = require('fs');
const path = require('path');
const {
  initMysqlAndLoadStore,
  syncStoreToMysql,
  getMysqlStatus,
} = require('./mysql');

// backend 폴더 바깥(루트 폴더)에 저장하여 `node --watch index.js`의 무한 재시작 방지!
const DATA_FILE_PATH = path.resolve(__dirname, '..', '..', '.medelivery-data.json');
// 만약 기존 backend/db/data.json이 남아 있으면 마이그레이션 후 제거
const LEGACY_FILE_PATH = path.join(__dirname, 'data.json');

const store = {
  users: [],         // PK: user_id
  diaries: [],       // PK: diary_id, FK: user_id
  interviews: [],    // PK: interview_id, FK: user_id
  interviewQs: [],   // PK: question_id, FK: interview_id
  time_capsules: [], // PK: capsule_id, FK: user_id
  notifications: [], // 개봉일 도래 시 발송된 이메일/SMS 내역
};

const seq = {
  user_id: 1,
  diary_id: 1,
  interview_id: 1,
  question_id: 1,
  capsule_id: 1,
  notification_id: 1,
};

function loadStoreFromDisk() {
  try {
    let targetPath = DATA_FILE_PATH;
    if (!fs.existsSync(targetPath) && fs.existsSync(LEGACY_FILE_PATH)) {
      targetPath = LEGACY_FILE_PATH;
    }
    if (!fs.existsSync(targetPath)) return;

    const raw = fs.readFileSync(targetPath, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);

    if (parsed.store) {
      for (const key of Object.keys(store)) {
        if (Array.isArray(parsed.store[key])) {
          store[key] = parsed.store[key];
        }
      }
    }
    if (parsed.seq) {
      for (const key of Object.keys(seq)) {
        if (typeof parsed.seq[key] === 'number') {
          seq[key] = parsed.seq[key];
        }
      }
    }

    // 구 경로 파일이 있으면 새 경로로 옮기고 구 파일 삭제
    if (targetPath === LEGACY_FILE_PATH) {
      saveStoreToDisk();
      try {
        fs.unlinkSync(LEGACY_FILE_PATH);
      } catch (_) {}
    }

    console.log(
      `[DataStore] 저장된 데이터 자동 복원 완료 -> 회원: ${store.users.length}명, 일기: ${store.diaries.length}건, 자서전: ${store.interviews.length}단원, 타임캡슐: ${store.time_capsules.length}개`
    );
  } catch (err) {
    console.warn('[DataStore] 데이터 복원 중 경고:', err.message);
  }
}

function saveStoreToDisk() {
  try {
    const payload = JSON.stringify({ store, seq }, null, 2);
    fs.writeFileSync(DATA_FILE_PATH, payload, 'utf8');
    // AWS RDS (MySQL)가 연결되어 있으면 MySQL 5개 테이블에도 즉시 비동기 동기화!
    syncStoreToMysql(store).catch(() => {});
  } catch (err) {
    console.warn('[DataStore] 자동 저장 실패:', err.message);
  }
}

function resetStore() {
  store.users = [];
  store.diaries = [];
  store.interviews = [];
  store.interviewQs = [];
  store.time_capsules = [];
  store.notifications = [];

  seq.user_id = 1;
  seq.diary_id = 1;
  seq.interview_id = 1;
  seq.question_id = 1;
  seq.capsule_id = 1;
  seq.notification_id = 1;

  try {
    if (fs.existsSync(DATA_FILE_PATH)) fs.unlinkSync(DATA_FILE_PATH);
    if (fs.existsSync(LEGACY_FILE_PATH)) fs.unlinkSync(LEGACY_FILE_PATH);
    syncStoreToMysql(store).catch(() => {});
  } catch (err) {
    console.warn('[DataStore] 데이터 파일 삭제 실패:', err.message);
  }
}

loadStoreFromDisk();
// .env에 AWS RDS (DB_HOST)가 설정되어 있으면 자동으로 MySQL 5개 테이블 생성 및 데이터 로드!
initMysqlAndLoadStore(store, seq).catch(() => {});

function toPublicUser(user) {
  if (!user) return null;
  return {
    user_id: user.user_id,
    account_id: user.account_id,
    username: user.username,
    emergency_contact: user.emergency_contact,
    inactivity_days: user.inactivity_days,
    last_active_at: user.last_active_at,
    access_code: user.access_code,
    code_generated_at: user.code_generated_at,
    is_code_verified: user.is_code_verified,
    is_transferred: user.is_transferred,
    created_at: user.created_at,
  };
}

function generateSixCharInviteCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const specials = '!@#$%^&*';
  const allChars = letters + digits + specials;

  let code = '';
  do {
    const pick = (str) => str[Math.floor(Math.random() * str.length)];
    const chars = [
      pick(letters),
      pick(digits),
      pick(specials),
      pick(allChars),
      pick(allChars),
      pick(allChars),
    ];

    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    code = chars.join('');
  } while (
    store.users.some((u) => u.access_code === code) ||
    store.time_capsules.some((c) => c.access_code === code)
  );

  return code;
}

module.exports = {
  store,
  seq,
  toPublicUser,
  generateSixCharInviteCode,
  saveStoreToDisk,
  resetStore,
  getMysqlStatus,
};
