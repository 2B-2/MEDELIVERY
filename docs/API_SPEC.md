# MEDELIVERY 백엔드 API 명세서 (v2.1 - 전체 기능 100% 구현 완료본)

본 문서는 **1) MEDELIVERY 데이터베이스 설계(SQL 스키마 5개 테이블)**와 **2) MEDELIVERY 기능 명세서(`ACC-01` ~ `CAP-02`)**를 기반으로 구현된 통합 백엔드 서버(`http://localhost:4000`)의 최종 API 명세서입니다.

---

## 1. 서버 실행 및 테스트 페이지 안내

* **서버 실행**: 프로젝트 루트(`C:\MEDELIVERY-main`) 또는 `backend` 폴더에서 `npm run dev`
* **기본 URL**: `http://localhost:4000`
* **웹 API 통합 테스트 콘솔**: `http://localhost:4000/test`
* **수신자(유족) 6자리 보안 초대 코드 입력 & PDF 다운로드 뷰**: `http://localhost:4000/capsule-view`
* **데이터 자동 영구 저장**: 모든 변경 사항은 `.medelivery-data.json`에 즉시 자동 저장되며 서버 재시작 후에도 유지됩니다.

---

## 2. 기능 명세서(기능 ID) 1:1 API 매핑 요약표

| 기능 ID | 대분류 | 소분류(기능명) | HTTP Method & URI | 대상 테이블 및 주요 필드 | 인증 |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **ACC-01** | 회원 관리 | 회원가입 | `POST /api/auth/signup` | `users` (`account_id`, `password`, `username`, `emergency_contact`, `inactivity_days`) | X |
| **ACC-01** | 회원 관리 | 로그인 | `POST /api/auth/login` | `users` (`account_id`, `password`, `last_active_at`) | X |
| **ACC-01** | 회원 관리 | 내 정보 조회 | `GET /api/auth/me` | `users` 전체 공개 필드 | **O** |
| **ACC-02** | 회원 관리 | 비상 수신자 및 미접속 기준 등록/수정 | `PUT /api/auth/emergency-contact` | `users` (`emergency_contact`, `inactivity_days`, `username`) | **O** |
| **DMS-01** | 데드맨 스위치 | 미접속 감지 및 유족 보안코드 이메일 발송 | `POST /api/deadman/check` *(+10초 주기 자동 스케줄러)* | `users` (`inactivity_days`, `last_active_at`, `access_code`, `code_generated_at`) | 시스템 |
| **DMS-02** | 데드맨 스위치 | 유족 6자리 보안코드 인증 및 전체 아카이브 전달 | `POST /api/deadman/verify` *(및 `POST /api/time-capsules/unlock` 통합 지원)* | `users` (`access_code`, `is_code_verified`, `is_transferred`) + `diaries`, `interviews`, `time_capsules` | 6자리 코드 |
| **MEM-01** | 고인 다이어리 | 일기 작성 및 저장 | `POST /api/diaries` | `diaries` (`diary_id`, `user_id`, `title`, `content`, `created_at`) | **O** |
| **MEM-02** | 고인 다이어리 | 일기 목록 조회 (날짜별 보기 지원) | `GET /api/diaries` (`?date=YYYY-MM-DD`) | `diaries` (`diary_id`, `title`, `content`, `created_at`) | **O** |
| **MEM-02** | 고인 다이어리 | 일기 상세 조회 / 수정 / 삭제 (번호 자동 앞당김) | `GET / PUT / DELETE /api/diaries/:diary_id` | `diaries` (`title`, `content`) | **O** |
| **ITV-01** | AI 자서전 | 인터뷰 단원 생성 / 목록 조회 / 삭제 | `POST / GET / DELETE /api/interviews` | `interviews` (`interview_id`, `user_id`, `chapter_name`, `created_at`) | **O** |
| **ITV-02** | AI 자서전 | 단원별 AI 질문·답변 저장 및 자서전 본문 자동 생성 | `POST / GET /api/interviews/:interview_id/questions` | `interviewQs` (`question_id`, `interview_id`, `question_answer`) | **O** |
| **CAP-01** | 타임캡슐 | 타임캡슐 메시지 봉인 (등록) | `POST /api/time-capsules` | `time_capsules` (`capsule_id`, `user_id`, `title`, `message`, `open_date`) | **O** |
| **CAP-02** | 타임캡슐 | 조건부 개봉 제어, 6자리 특수문자 코드 이메일 발송, 첫 방문 14일 후 자동 삭제 | `GET /api/time-capsules`, `POST /api/time-capsules/unlock` | `time_capsules` (`open_date`, `is_opened`, `message`) | **O** / 코드 |
