/**
 * MEDELIVERY AWS RDS (MySQL) 연동 및 schema.sql 자동 구축 모듈
 *
 * [동작 방식 - A안: AWS EC2 + AWS RDS for MySQL]
 * 1. .env 파일에 DB_HOST(예: xxx.rds.amazonaws.com)가 설정되어 있지 않으면:
 *    MySQL 연결을 시도하지 않고 로컬 파일(.medelivery-data.json) 모드로 안전하게 동작합니다.
 * 2. .env 파일에 DB_HOST, DB_USER, DB_PASSWORD가 설정되어 있으면:
 *    - 서버 시작 시 AWS RDS에 접속하여 데이터베이스(DB_NAME, 기본값 medelivery)를 자동 생성합니다.
 *    - backend/db/schema.sql 파일을 읽어 5개 테이블(users, diaries, interviews, interviewQs, time_capsules)을 자동 생성합니다.
 *    - AWS RDS의 기존 데이터를 메모리로 불러오고, 이후 모든 API에서 데이터 변경 시 AWS RDS MySQL 테이블에 실시간으로 INSERT/UPDATE/DELETE 동기화합니다.
 */

const fs = require('fs');
const path = require('path');

let mysql = null;
try {
  mysql = require('mysql2/promise');
} catch (err) {
  // mysql2 미설치 환경에서도 로컬 파일 모드로 정상 동작하도록 예외 처리
}

let pool = null;
let isMysqlConnected = false;

function hasMysqlEnv() {
  return Boolean(
    process.env.DB_HOST &&
      String(process.env.DB_HOST).trim() &&
      process.env.DB_USER &&
      String(process.env.DB_USER).trim()
  );
}

function extractCleanHostname(rawHost) {
  if (!rawHost) return '';
  const str = String(rawHost).trim();
  // 사용자가 `mysql -h xxx.rds.amazonaws.com -P 3306 ...` 명령어 전체를 붙여넣은 경우 호스트 주소만 자동 추출!
  const rdsMatch = str.match(/[a-zA-Z0-9.-]+\.rds\.amazonaws\.com/);
  if (rdsMatch) return rdsMatch[0];
  const flagMatch = str.match(/-h\s+([^\s]+)/);
  if (flagMatch) return flagMatch[1];
  return str.replace(/^https?:\/\//, '').split(/[/:?\s]/)[0];
}

function toMysqlDatetime(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * 1. AWS RDS (MySQL) 초기화, schema.sql 5개 테이블 자동 생성 및 초기 데이터 로드
 */
async function initMysqlAndLoadStore(store, seq) {
  if (!hasMysqlEnv()) {
    console.log(
      '[DB] .env에 DB_HOST가 설정되지 않아 로컬 자동 저장(.medelivery-data.json) 모드로 실행됩니다.'
    );
    return false;
  }

  if (!mysql) {
    console.warn(
      '[DB] mysql2 패키지가 아직 설치되지 않았습니다. 터미널에서 `cd backend && npm install`을 실행해 주세요.'
    );
    return false;
  }

  const host = extractCleanHostname(process.env.DB_HOST);
  const port = Number(process.env.DB_PORT || 3306);
  const user = String(process.env.DB_USER).trim();
  const password = process.env.DB_PASSWORD || '';
  const database = String(process.env.DB_NAME || 'medelivery').trim();

  try {
    // 1단계: 데이터베이스(medelivery)가 없으면 먼저 생성
    const bootstrapConn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
    });
    await bootstrapConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await bootstrapConn.end();

    // 2단계: 커넥션 풀 생성
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: true,
    });

    // 3단계: schema.sql의 5개 테이블(users, diaries, interviews, interviewQs, time_capsules) 자동 생성
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schemaSql);
      // 이메일 주소(20자 초과)도 emergency_contact에 저장될 수 있도록 컬럼 길이 자동 확장 보장
      await pool
        .query(
          'ALTER TABLE users MODIFY COLUMN emergency_contact VARCHAR(100) NOT NULL;'
        )
        .catch(() => {});
    }

    isMysqlConnected = true;
    console.log(
      `[AWS RDS MySQL] 연결 및 5개 테이블(schema.sql) 준비 완료! (${host}:${port}/${database})`
    );

    // 4단계: MySQL에 저장된 기존 레코드를 store로 불러오기
    const [users] = await pool.query('SELECT * FROM users ORDER BY user_id ASC');
    const [diaries] = await pool.query('SELECT * FROM diaries ORDER BY diary_id ASC');
    const [interviews] = await pool.query(
      'SELECT * FROM interviews ORDER BY interview_id ASC'
    );
    const [interviewQs] = await pool.query(
      'SELECT * FROM interviewQs ORDER BY question_id ASC'
    );
    const [timeCapsules] = await pool.query(
      'SELECT * FROM time_capsules ORDER BY capsule_id ASC'
    );

    if (
      users.length > 0 ||
      diaries.length > 0 ||
      interviews.length > 0 ||
      timeCapsules.length > 0
    ) {
      store.users = users.map((u) => ({
        ...u,
        is_code_verified: Boolean(u.is_code_verified),
        is_transferred: Boolean(u.is_transferred),
      }));
      store.diaries = diaries;
      store.interviews = interviews;
      store.interviewQs = interviewQs;
      store.time_capsules = timeCapsules.map((c) => ({
        ...c,
        is_opened: Boolean(c.is_opened),
      }));

      seq.user_id =
        users.reduce((max, u) => Math.max(max, Number(u.user_id)), 0) + 1;
      seq.diary_id =
        diaries.reduce((max, d) => Math.max(max, Number(d.diary_id)), 0) + 1;
      seq.interview_id =
        interviews.reduce((max, i) => Math.max(max, Number(i.interview_id)), 0) + 1;
      seq.question_id =
        interviewQs.reduce((max, q) => Math.max(max, Number(q.question_id)), 0) + 1;
      seq.capsule_id =
        timeCapsules.reduce((max, c) => Math.max(max, Number(c.capsule_id)), 0) + 1;

      console.log(
        `[AWS RDS MySQL] DB 데이터 로드 완료 (회원 ${users.length}명, 일기 ${diaries.length}건, 자서전 ${interviews.length}단원, 타임캡슐 ${timeCapsules.length}개)`
      );
    } else if (store.users.length > 0) {
      // MySQL이 비어 있고 로컬 데이터가 있으면 초기 마이그레이션 동기화
      await syncStoreToMysql(store);
    }

    return true;
  } catch (err) {
    isMysqlConnected = false;
    console.error(
      '[AWS RDS MySQL] 연결 실패 (로컬 파일 저장 모드로 계속 실행됩니다):',
      err.message
    );
    return false;
  }
}

/**
 * 2. 데이터 변경 시 AWS RDS (MySQL) 5개 테이블과 실시간 동기화
 */
async function syncStoreToMysql(store) {
  if (!isMysqlConnected || !pool) return;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // ① users 테이블 동기화
    await conn.query('DELETE FROM users');
    for (const u of store.users) {
      await conn.query(
        `INSERT INTO users (
          user_id, account_id, password, username, emergency_contact,
          inactivity_days, last_active_at, access_code, code_generated_at,
          is_code_verified, is_transferred, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          u.user_id,
          u.account_id,
          u.password,
          u.username || u.account_id,
          u.emergency_contact || '',
          u.inactivity_days || 90,
          toMysqlDatetime(u.last_active_at),
          u.access_code || null,
          toMysqlDatetime(u.code_generated_at),
          Boolean(u.is_code_verified),
          Boolean(u.is_transferred),
          toMysqlDatetime(u.created_at) || toMysqlDatetime(new Date().toISOString()),
        ]
      );
    }

    // ② diaries 테이블 동기화
    await conn.query('DELETE FROM diaries');
    for (const d of store.diaries) {
      await conn.query(
        `INSERT INTO diaries (diary_id, user_id, title, content, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          d.diary_id,
          d.user_id,
          d.title,
          d.content,
          toMysqlDatetime(d.created_at) || toMysqlDatetime(new Date().toISOString()),
        ]
      );
    }

    // ③ interviews 테이블 동기화
    await conn.query('DELETE FROM interviews');
    for (const i of store.interviews) {
      await conn.query(
        `INSERT INTO interviews (interview_id, user_id, chapter_name, created_at)
         VALUES (?, ?, ?, ?)`,
        [
          i.interview_id,
          i.user_id,
          i.chapter_name,
          toMysqlDatetime(i.created_at) || toMysqlDatetime(new Date().toISOString()),
        ]
      );
    }

    // ④ interviewQs 테이블 동기화
    await conn.query('DELETE FROM interviewQs');
    for (const q of store.interviewQs) {
      await conn.query(
        `INSERT INTO interviewQs (question_id, interview_id, question_answer)
         VALUES (?, ?, ?)`,
        [q.question_id, q.interview_id, q.question_answer]
      );
    }

    // ⑤ time_capsules 테이블 동기화
    await conn.query('DELETE FROM time_capsules');
    for (const c of store.time_capsules) {
      await conn.query(
        `INSERT INTO time_capsules (capsule_id, user_id, title, message, open_date, is_opened)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          c.capsule_id,
          c.user_id,
          c.title,
          c.message,
          toMysqlDatetime(c.open_date) || toMysqlDatetime(new Date().toISOString()),
          Boolean(c.is_opened),
        ]
      );
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error('[AWS RDS MySQL] 테이블 동기화 오류:', err.message);
  } finally {
    conn.release();
  }
}

function getMysqlStatus() {
  return {
    connected: isMysqlConnected,
    mode: isMysqlConnected ? 'AWS_RDS_MYSQL' : 'LOCAL_JSON_FILE',
    host: process.env.DB_HOST || null,
    database: process.env.DB_NAME || 'medelivery',
  };
}

/**
 * 3. [AWS RDS 연동 전 사전 검증 (Dry-Run)]
 * - MySQL 서버가 아직 없어도 schema.sql의 5개 테이블 구조와 현재 저장된 데이터(users, diaries, interviews, interviewQs, time_capsules)의
 *   데이터 타입, NOT NULL, 외래키(FK) 무결성을 검사하고 실제 실행될 SQL 쿼리(INSERT문)를 시뮬레이션 생성하여 검증합니다.
 */
function verifySqlCompatibilityDryRun(store) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaExists = fs.existsSync(schemaPath);
  const schemaSql = schemaExists ? fs.readFileSync(schemaPath, 'utf8') : '';

  const requiredTables = [
    'users',
    'diaries',
    'interviews',
    'interviewQs',
    'time_capsules',
  ];
  const detectedTables = requiredTables.filter((t) =>
    new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${t}\\b`, 'i').test(
      schemaSql
    )
  );

  const issues = [];
  const generatedSqlPreview = [];

  // 1) users 검증
  const userIdSet = new Set();
  for (const u of store.users) {
    userIdSet.add(u.user_id);
    if (!u.account_id || String(u.account_id).length > 50) {
      issues.push(`users.account_id 제약 위반 (user_id=${u.user_id})`);
    }
    if (!u.password) {
      issues.push(`users.password NOT NULL 위반 (user_id=${u.user_id})`);
    }
    generatedSqlPreview.push(
      `INSERT INTO users (user_id, account_id, username, emergency_contact, inactivity_days, last_active_at, access_code, is_code_verified, is_transferred, created_at) VALUES (${u.user_id}, '${u.account_id}', '${u.username}', '${u.emergency_contact}', ${u.inactivity_days}, '${toMysqlDatetime(u.last_active_at)}', ${u.access_code ? `'${u.access_code}'` : 'NULL'}, ${Boolean(u.is_code_verified)}, ${Boolean(u.is_transferred)}, '${toMysqlDatetime(u.created_at)}');`
    );
  }

  // 2) diaries 검증 (FK: user_id)
  for (const d of store.diaries) {
    if (!userIdSet.has(d.user_id)) {
      issues.push(`diaries.user_id 외래키(FK) 불일치 (diary_id=${d.diary_id})`);
    }
    generatedSqlPreview.push(
      `INSERT INTO diaries (diary_id, user_id, title, content, created_at) VALUES (${d.diary_id}, ${d.user_id}, '${String(d.title).replace(/'/g, "''")}', '${String(d.content).slice(0, 30).replace(/'/g, "''")}...', '${toMysqlDatetime(d.created_at)}');`
    );
  }

  // 3) interviews & interviewQs 검증
  const interviewIdSet = new Set();
  for (const i of store.interviews) {
    interviewIdSet.add(i.interview_id);
    if (!userIdSet.has(i.user_id)) {
      issues.push(`interviews.user_id 외래키(FK) 불일치 (interview_id=${i.interview_id})`);
    }
    generatedSqlPreview.push(
      `INSERT INTO interviews (interview_id, user_id, chapter_name, created_at) VALUES (${i.interview_id}, ${i.user_id}, '${String(i.chapter_name).replace(/'/g, "''")}', '${toMysqlDatetime(i.created_at)}');`
    );
  }

  for (const q of store.interviewQs) {
    if (!interviewIdSet.has(q.interview_id)) {
      issues.push(`interviewQs.interview_id 외래키(FK) 불일치 (question_id=${q.question_id})`);
    }
    generatedSqlPreview.push(
      `INSERT INTO interviewQs (question_id, interview_id, question_answer) VALUES (${q.question_id}, ${q.interview_id}, '${String(q.question_answer).slice(0, 40).replace(/\n/g, ' ').replace(/'/g, "''")}...');`
    );
  }

  // 4) time_capsules 검증
  for (const c of store.time_capsules) {
    if (!userIdSet.has(c.user_id)) {
      issues.push(`time_capsules.user_id 외래키(FK) 불일치 (capsule_id=${c.capsule_id})`);
    }
    generatedSqlPreview.push(
      `INSERT INTO time_capsules (capsule_id, user_id, title, message, open_date, is_opened) VALUES (${c.capsule_id}, ${c.user_id}, '${String(c.title).replace(/'/g, "''")}', '${String(c.message).slice(0, 30).replace(/'/g, "''")}...', '${toMysqlDatetime(c.open_date)}', ${Boolean(c.is_opened)});`
    );
  }

  return {
    ready_for_aws_rds:
      schemaExists &&
      detectedTables.length === requiredTables.length &&
      issues.length === 0,
    mysql2_driver_installed: Boolean(mysql),
    current_storage_mode: isMysqlConnected ? 'AWS_RDS_MYSQL' : 'LOCAL_JSON_FILE',
    schema_check: {
      schema_file: 'backend/db/schema.sql',
      required_tables: requiredTables,
      verified_tables: detectedTables,
      all_5_tables_valid: detectedTables.length === requiredTables.length,
    },
    foreign_key_and_column_integrity: {
      passed: issues.length === 0,
      issues,
    },
    record_counts_to_migrate: {
      users: store.users.length,
      diaries: store.diaries.length,
      interviews: store.interviews.length,
      interviewQs: store.interviewQs.length,
      time_capsules: store.time_capsules.length,
    },
    sql_migration_preview:
      generatedSqlPreview.length > 0
        ? generatedSqlPreview
        : ['(현재 저장된 레코드가 없습니다. 회원가입/일기/자서전/타임캡슐을 생성하면 실제 MySQL INSERT 쿼리가 이곳에 미리보기로 표시됩니다.)'],
  };
}

/**
 * 4. [실시간 AWS RDS / MySQL 연결 테스트]
 * - 웹 테스트 콘솔에서 입력한 Host, Port, User, Password, Database로 즉시 접속을 테스트하고
 *   5개 테이블 자동 생성 및 현재 데이터 마이그레이션까지 한 번에 수행합니다.
 */
async function testAndConnectLiveMysql({ host, port, user, password, database }, store, seq) {
  if (!mysql) {
    throw new Error(
      'mysql2 드라이버가 아직 설치되지 않았습니다. 터미널에서 `cd C:\\MEDELIVERY-main\\backend && npm install`을 실행해 주세요.'
    );
  }
  if (!host || !user) {
    throw new Error('MySQL 호스트 주소(DB_HOST)와 사용자 이름(DB_USER)을 입력해 주세요.');
  }

  const cleanHost = extractCleanHostname(host);
  process.env.DB_HOST = cleanHost;
  process.env.DB_PORT = String(port || 3306).trim();
  process.env.DB_USER = String(user).trim();
  process.env.DB_PASSWORD = password || '';
  process.env.DB_NAME = String(database || 'medelivery').trim();

  let lastErrMessage = '';
  try {
    const bootstrapConn = await mysql.createConnection({
      host: cleanHost,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      multipleStatements: true,
      connectTimeout: 10000,
    });
    await bootstrapConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await bootstrapConn.end();
  } catch (connErr) {
    lastErrMessage = connErr.message;
  }

  const ok = await initMysqlAndLoadStore(store, seq);
  if (!ok) {
    throw new Error(
      `MySQL(${cleanHost}) 연결 실패 [원인: ${lastErrMessage || '접속 거부'}]. 계정/비밀번호, 퍼블릭 액세스(예), 또는 AWS RDS 보안 그룹(3306 포트 허용)을 확인해 주세요.`
    );
  }

  await syncStoreToMysql(store);
  const [tables] = await pool.query('SHOW TABLES');

  // 연결에 성공하면 backend/.env 파일에도 DB 접속 정보를 자동 저장하여 서버 재시작 시에도 자동 연결되도록 처리!
  try {
    const envPath = path.resolve(__dirname, '..', '.env');
    let envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const upsertEnv = (key, val) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envText)) {
        envText = envText.replace(regex, `${key}=${val}`);
      } else {
        envText += `\n${key}=${val}`;
      }
    };
    upsertEnv('DB_HOST', process.env.DB_HOST);
    upsertEnv('DB_PORT', process.env.DB_PORT);
    upsertEnv('DB_USER', process.env.DB_USER);
    upsertEnv('DB_PASSWORD', process.env.DB_PASSWORD);
    upsertEnv('DB_NAME', process.env.DB_NAME);
    fs.writeFileSync(envPath, envText.trim() + '\n', 'utf8');
  } catch (e) {
    console.warn('[AWS RDS] .env 자동 기록 경고:', e.message);
  }

  return {
    connected: true,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    tables_in_db: tables.map((row) => Object.values(row)[0]),
  };
}

/**
 * 5. [AWS RDS (MySQL) 5개 테이블 실제 SELECT 쿼리 직접 조회]
 * - 메모리가 아닌 AWS RDS 클라우드 DB에 직접 `SELECT * FROM ...` 쿼리를 날려 실제 DB에 들어있는 행들을 그대로 반환합니다.
 */
async function queryAllMysqlTablesDirectly() {
  if (!isMysqlConnected || !pool) {
    throw new Error(
      '현재 AWS RDS (MySQL)에 연결되어 있지 않습니다. 먼저 [② 실제 연결] 버튼을 눌러 연결해 주세요.'
    );
  }

  const [tables] = await pool.query('SHOW TABLES');
  const [users] = await pool.query(
    'SELECT user_id, account_id, username, emergency_contact, inactivity_days, last_active_at, access_code, code_generated_at, is_code_verified, is_transferred, created_at FROM users ORDER BY user_id ASC'
  );
  const [diaries] = await pool.query('SELECT * FROM diaries ORDER BY diary_id ASC');
  const [interviews] = await pool.query(
    'SELECT * FROM interviews ORDER BY interview_id ASC'
  );
  const [interviewQs] = await pool.query(
    'SELECT * FROM interviewQs ORDER BY question_id ASC'
  );
  const [time_capsules] = await pool.query(
    'SELECT * FROM time_capsules ORDER BY capsule_id ASC'
  );

  return {
    source: `AWS RDS Live Query (${process.env.DB_HOST} / DB: ${process.env.DB_NAME})`,
    tables_list: tables.map((r) => Object.values(r)[0]),
    tables_data: {
      users,
      diaries,
      interviews,
      interviewQs,
      time_capsules,
    },
  };
}

module.exports = {
  initMysqlAndLoadStore,
  syncStoreToMysql,
  getMysqlStatus,
  verifySqlCompatibilityDryRun,
  testAndConnectLiveMysql,
  queryAllMysqlTablesDirectly,
};
