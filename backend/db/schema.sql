CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(50) NOT NULL UNIQUE COMMENT '로그인 아이디',
  password VARCHAR(255) NOT NULL COMMENT '비밀번호 해시 값',
  username VARCHAR(50) NOT NULL COMMENT '사용자 이름',
  emergency_contact VARCHAR(20) NOT NULL COMMENT '비상 수신자 전화번호',
  inactivity_days INT DEFAULT 90 COMMENT '미접속 기준 일수',
  last_active_at DATETIME NULL COMMENT '마지막 활동 시각',
  access_code VARCHAR(100) NULL UNIQUE COMMENT '수신자 고유 인증 코드',
  code_generated_at DATETIME NULL COMMENT '고유 코드 생성 시각',
  is_code_verified BOOLEAN DEFAULT FALSE COMMENT '수신자 고유 코드 인증 여부',
  is_transferred BOOLEAN DEFAULT FALSE COMMENT '아카이브 권한 전달 여부',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '계정 생성일'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS diaries (
  diary_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL COMMENT '일기 제목',
  content TEXT NOT NULL COMMENT '일기 본문 내용',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '일기 작성일',
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS interviews (
  interview_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  chapter_name VARCHAR(100) NOT NULL COMMENT '자서전 단원명',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '대화 작성일',
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS interviewQs (
  question_id INT AUTO_INCREMENT PRIMARY KEY,
  interview_id INT NOT NULL,
  question_answer TEXT NOT NULL COMMENT 'AI 질문 및 사용자 답변 기록',
  FOREIGN KEY (interview_id) REFERENCES interviews(interview_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS time_capsules (
  capsule_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL COMMENT '타임캡슐 제목',
  message TEXT NOT NULL COMMENT '전달 메시지 본문',
  open_date DATETIME NOT NULL COMMENT '개봉 지정일',
  is_opened BOOLEAN DEFAULT FALSE COMMENT '개봉 상태',
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
