# MEDELIVERY AWS 서버 & RDS(MySQL) 배포 가이드 (A안: AWS EC2 + AWS RDS)

본 가이드는 프론트엔드와 로컬 연동 확인이 모두 끝난 후, 마지막 단계에서 **AWS RDS(MySQL 데이터베이스)**와 **AWS EC2(Node.js 백엔드 서버)**를 구축하여 배포하는 절차입니다.

---

## 1단계: AWS RDS (MySQL 데이터베이스) 생성하기

내 컴퓨터에 MySQL을 설치할 필요 없이 AWS 클라우드에 MySQL을 생성합니다.

1. **AWS 콘솔 로그인** → 리전을 **서울 (`ap-northeast-2`)**로 설정합니다.
2. 상단 검색창에 **`RDS`**를 검색해 이동한 뒤 **[데이터베이스 생성]**을 클릭합니다.
3. 아래와 같이 선택합니다:
   * **엔진 옵션**: `MySQL`
   * **템플릿**: **`프리 티어 (Free tier)`** 선택 (12개월 무료)
   * **DB 인스턴스 식별자**: `medelivery-db`
   * **마스터 사용자 이름 (`DB_USER`)**: `admin`
   * **마스터 암호 (`DB_PASSWORD`)**: 기억하기 쉬운 비밀번호 입력 (예: `Medelivery1234!`)
   * **연결 → 퍼블릭 액세스**: **`예 (Yes)`** 선택 (내 로컬 PC나 외부에서도 접속 테스트가 가능하도록 허용)
   * **추가 구성 → 초기 데이터베이스 이름 (`DB_NAME`)**: `medelivery`
4. **[데이터베이스 생성]**을 누르고 약 5분 뒤 상태가 `사용 가능`이 되면 클릭하여 들어가 **엔드포인트(`medelivery-db.xxxx.ap-northeast-2.rds.amazonaws.com`)** 주소를 복사합니다.
5. **보안 그룹(방화벽) 열기**:
   * RDS 상세 화면의 **보안 그룹(VPC security groups)** 클릭 → **[인바운드 규칙 편집]**
   * 규칙 추가: 유형 **`MYSQL/Aurora (포트 3306)`**, 소스 **`Anywhere-IPv4 (0.0.0.0/0)`** 저장

---

## 2단계: 백엔드 `.env`에 AWS RDS 주소 연결하기 (5개 테이블 자동 생성!)

복잡한 SQL 프로그램(Workbench 등)으로 테이블을 직접 만들 필요가 없습니다!
`backend/.env` 파일에 아래 5줄만 적어주고 서버(`npm run dev` 또는 `npm start`)를 켜면 백엔드의 [backend/db/mysql.js](file:///C:/MEDELIVERY-main/backend/db/mysql.js)가 자동으로 AWS RDS에 접속해 [backend/db/schema.sql](file:///C:/MEDELIVERY-main/backend/db/schema.sql)의 **5개 테이블(`users`, `diaries`, `interviews`, `interviewQs`, `time_capsules`)을 한 번에 생성**합니다!

```env
PORT=4000
JWT_SECRET=medelivery-production-secret-key
DB_HOST=복사한_AWS_RDS_엔드포인트_주소.rds.amazonaws.com
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=설정한_RDS_비밀번호
DB_NAME=medelivery
```

서버 실행 시 터미널에 아래 문구가 뜨면 AWS RDS 연동이 100% 완료된 것입니다:
```text
[AWS RDS MySQL] 연결 및 5개 테이블(schema.sql) 준비 완료!
```

---

## 3단계: AWS EC2 (Node.js 백엔드 서버) 생성 및 배포

1. AWS 콘솔에서 **`EC2`** 검색 → **[인스턴스 시작]** 클릭
2. 설정:
   * **이름**: `medelivery-backend`
   * **OS 이미지**: `Ubuntu Server 24.04 LTS` (프리티어 사용 가능)
   * **인스턴스 유형**: `t2.micro` 또는 `t3.micro` (프리티어)
   * **키 페어**: 새 키 페어 생성 후 다운로드
   * **네트워크(보안 그룹)**: SSH(`22`), HTTP(`80`), 사용자 지정 TCP **`4000`**번 포트(Anywhere `0.0.0.0/0`) 허용
3. EC2 서버에 접속한 뒤 아래 명령어를 순서대로 입력하면 백엔드 서버 배포가 완료됩니다:

```bash
# 1. Node.js 20 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. GitHub에서 MEDELIVERY 프로젝트 클론
git clone https://github.com/2B-2/MEDELIVERY.git
cd MEDELIVERY/backend

# 3. 패키지 설치
npm install

# 4. .env 파일 생성 (위 2단계의 AWS RDS 주소 및 이메일/AI 키 붙여넣기)
nano .env

# 5. 서버가 꺼지지 않고 24시간 백그라운드에서 돌아가도록 PM2로 실행
sudo npm install -g pm2
pm2 start index.js --name medelivery-api
pm2 save
```

이제 `http://<EC2_퍼블릭_IP>:4000` 주소로 언제 어디서나 백엔드 API와 테스트 콘솔에 접속할 수 있습니다!
