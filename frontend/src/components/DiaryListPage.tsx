import { useEffect, useMemo, useState, type MouseEvent } from 'react';

// 추후 페이지 연결을 위한 임시 라우트 경로
const TEMP_ROUTES = {
  main: '/main',
  archive: '/archive',
  diaryList: '/diaries',
  diaryWrite: '/diaries/new', // 새 일기장(일기 쓰기) 생성 임시 주소
  timeCapsules: '/time-capsules',
  interviews: '/interviews',
  profile: '/profile',
} as const;

const API_BASE_URL = 'http://localhost:4000/api';

// API 명세서 v2.0 기준 타입 정의 (MEM-02)
interface UserProfile {
  user_id: number;
  account_id: string;
  username: string;
}

interface DiaryItem {
  diary_id: number;
  user_id: number;
  title: string;
  content: string;
  created_at: string;
}

interface DiaryListPageProps {
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

// 피그마 시안의 6개 일기 카드 초기 샘플 데이터 (최신순 정렬 확인용)
const MOCK_DIARIES: DiaryItem[] = [
  {
    diary_id: 6,
    user_id: 1,
    title: '겨울 끝의 포근한 저녁',
    content:
      '찬 바람이 불어오는 저녁, 창가에 앉아 따뜻한 차 한 잔을 마시며 오늘 하루의 온기를 천천히 되짚어 보았다.',
    created_at: '2026-11-17T19:30:00.000Z',
  },
  {
    diary_id: 5,
    user_id: 1,
    title: '엄마와 걷던 길',
    content:
      '오래된 골목길을 나란히 걸으며 어린 시절 이야기를 나누었다. 평범한 발걸음이 오래도록 기억에 남을 것 같다.',
    created_at: '2026-11-15T15:10:00.000Z',
  },
  {
    diary_id: 4,
    user_id: 1,
    title: '오랜만에 만난 우리',
    content:
      '한강 공원을 천천히 걸으며 그동안 나누지 못했던 이야기를 오래도록 나누었다. 웃음이 끊이지 않던 오후.',
    created_at: '2026-11-12T14:20:00.000Z',
  },
  {
    diary_id: 3,
    user_id: 1,
    title: '비 오는 날의 작은 쉼표',
    content:
      '창문을 두드리는 빗소리를 배경 삼아 좋아하던 책을 펼쳤다. 바쁜 일상 속에서 잠시 숨을 고르는 소중한 시간.',
    created_at: '2026-11-08T11:40:00.000Z',
  },
  {
    diary_id: 2,
    user_id: 1,
    title: '갓 구운 빵의 온기',
    content:
      '아침 일찍 동네 빵집에서 갓 나온 식빵을 사 왔다. 고소한 냄새만으로도 하루가 든든하게 시작되는 기분이다.',
    created_at: '2026-11-03T08:50:00.000Z',
  },
  {
    diary_id: 1,
    user_id: 1,
    title: '눈이 내려 고요했던 아침',
    content:
      '밤새 소복이 쌓인 흰 눈 덕분에 세상이 한층 고요해졌다. 첫 발자국을 남기며 조용히 아침 산책을 나섰다.',
    created_at: '2026-10-28T07:30:00.000Z',
  },
];

// 카드 상단 감성 일러스트 커버 팔레트 (피그마 시안 톤 반영)
const CARD_COVERS = [
  {
    bg: 'from-[#E4C3A8] via-[#DFB79B] to-[#B78B74]',
    accent: '#7A543E',
    scene: 'sunset',
  },
  {
    bg: 'from-[#DFD3C3] via-[#CBBBA6] to-[#A6927C]',
    accent: '#5E4B3B',
    scene: 'alley',
  },
  {
    bg: 'from-[#E6D2B5] via-[#D6B88D] to-[#B38E5D]',
    accent: '#634826',
    scene: 'cafe',
  },
  {
    bg: 'from-[#CBD3D9] via-[#B2BFC8] to-[#8A9AA6]',
    accent: '#3F4F5C',
    scene: 'rain',
  },
  {
    bg: 'from-[#E8D5B7] via-[#D8BC94] to-[#B89464]',
    accent: '#664B28',
    scene: 'bakery',
  },
  {
    bg: 'from-[#DCE1E5] via-[#C5CDD4] to-[#9DA8B3]',
    accent: '#46525E',
    scene: 'snow',
  },
] as const;

type FilterTab = 'all' | 'recentMonth' | 'thisYear';
type SortOrder = 'latest' | 'oldest';

function formatDotDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

export default function DiaryListPage({ onLogout, onNavigate }: DiaryListPageProps) {
  const [user, setUser] = useState<UserProfile>({
    user_id: 1,
    account_id: 'fin_user',
    username: 'FIN',
  });
  const [diaries, setDiaries] = useState<DiaryItem[]>(MOCK_DIARIES);
  const [isLoading, setIsLoading] = useState(false);

  // 검색, 필터 탭, 정렬 상태 (기본값: 최신순 'latest')
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');

  // 일기 상세보기 모달 상태
  const [selectedDiary, setSelectedDiary] = useState<DiaryItem | null>(null);

  // 사용자 정보 및 일기 목록 조회 (MEM-02: GET /api/diaries)
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser((prev) => ({ ...prev, ...parsed }));
      } catch {
        // 파싱 실패 시 기본값 유지
      }
    }

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const fetchDiaries = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/diaries`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const result = await response.json();
          if (result.success && Array.isArray(result.data)) {
            setDiaries(result.data);
          }
        }
      } catch {
        // 백엔드 서버 미실행 시 샘플 데이터 유지
      } finally {
        setIsLoading(false);
      }
    };

    fetchDiaries();
  }, []);

  // 최신순 정렬 + 검색어 + 기간 탭 필터링
  const visibleDiaries = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return diaries
      .filter((item) => {
        const keyword = searchQuery.trim().toLowerCase();
        const matchesSearch =
          keyword === '' ||
          item.title.toLowerCase().includes(keyword) ||
          item.content.toLowerCase().includes(keyword);

        if (!matchesSearch) return false;

        const createdDate = new Date(item.created_at);
        if (Number.isNaN(createdDate.getTime())) return true;

        if (activeTab === 'recentMonth') {
          return createdDate >= thirtyDaysAgo;
        }
        if (activeTab === 'thisYear') {
          return createdDate.getFullYear() === now.getFullYear();
        }
        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.created_at).getTime() || 0;
        const timeB = new Date(b.created_at).getTime() || 0;
        return sortOrder === 'latest' ? timeB - timeA : timeA - timeB;
      });
  }, [diaries, searchQuery, activeTab, sortOrder]);

  // 페이지 이동 핸들러
  const handleNavigate = (
    e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>,
    path: string,
    label: string
  ) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    alert(`'${label}' 화면으로 이동합니다. (임시 연결 경로: ${path})`);
  };

  // 일기 삭제 처리 (MEM-02: DELETE /api/diaries/:diary_id)
  const handleDeleteDiary = async (diaryId: number) => {
    if (!window.confirm('이 일기를 정말 삭제하시겠습니까?')) return;

    const token = localStorage.getItem('accessToken');
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/diaries/${diaryId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // 오프라인/테스트 모드에서도 목록에서 제거
      }
    }

    setDiaries((prev) => prev.filter((item) => item.diary_id !== diaryId));
    setSelectedDiary(null);
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF6F0] text-[#2C221A] font-['Noto_Sans_KR',sans-serif]">
      {/* 상단 고정 헤더 (메인페이지·일기쓰기와 동일한 구조) */}
      <header className="sticky top-0 z-30 w-full bg-[#FAF6F0]/95 backdrop-blur-sm border-b border-[#E8E1D9]">
        <div className="max-w-[1040px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          {/* 왼쪽 로고 */}
          <a
            href={TEMP_ROUTES.main}
            onClick={(e) => handleNavigate(e, TEMP_ROUTES.main, '메인 아카이브')}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-7 h-7 rounded-full bg-[#9B7348] flex items-center justify-center text-[#FAF6F0] shadow-xs">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <span className="font-['Noto_Serif_KR',serif] text-[15px] font-bold tracking-wider text-[#2C221A]">
              MEDELIVERY
            </span>
          </a>

          {/* 중앙 네비게이션 메뉴 ('일기' 활성화 상태) */}
          <nav className="hidden md:flex items-center gap-7 text-[13px] font-medium">
            <a
              href={TEMP_ROUTES.archive}
              onClick={(e) => handleNavigate(e, TEMP_ROUTES.archive, '아카이브')}
              className="flex items-center gap-1.5 text-[#7D6E60] hover:text-[#2C221A] transition-colors py-5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
              </svg>
              아카이브
            </a>

            <a
              href={TEMP_ROUTES.diaryList}
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('all');
                setSearchQuery('');
              }}
              className="flex items-center gap-1.5 text-[#2C221A] font-semibold border-b-2 border-[#9B7348] py-5"
            >
              <svg className="w-3.5 h-3.5 text-[#9B7348]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              일기
            </a>

            <a
              href={TEMP_ROUTES.timeCapsules}
              onClick={(e) => handleNavigate(e, TEMP_ROUTES.timeCapsules, '타임캡슐')}
              className="flex items-center gap-1.5 text-[#7D6E60] hover:text-[#2C221A] transition-colors py-5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              타임캡슐
            </a>

            <a
              href={TEMP_ROUTES.interviews}
              onClick={(e) => handleNavigate(e, TEMP_ROUTES.interviews, '자서전')}
              className="flex items-center gap-1.5 text-[#7D6E60] hover:text-[#2C221A] transition-colors py-5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              자서전
            </a>
          </nav>

          {/* 오른쪽 사용자 프로필 영역 */}
          <div className="flex items-center gap-2.5">
            <a
              href={TEMP_ROUTES.profile}
              onClick={(e) =>
                handleNavigate(e, TEMP_ROUTES.profile, `${user.username}님 프로필 및 데드맨 스위치 설정`)
              }
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-[#F2ECE3] hover:bg-[#E8DFD2] border border-[#E8E1D9] transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-[#9B7348] text-white text-[11px] font-bold flex items-center justify-center">
                {(user.username || 'F').slice(0, 1).toUpperCase()}
              </span>
              <span className="text-xs font-semibold text-[#3E2D1E]">
                {user.username || 'FIN'}님
              </span>
            </a>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="text-[11px] text-[#8C7A68] hover:text-[#2C221A] px-2 py-1 cursor-pointer"
              >
                로그아웃
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 컨테이너 */}
      <main className="max-w-[1040px] mx-auto px-5 sm:px-8 py-9 sm:py-11">
        {/* 상단 타이틀 & 오른쪽 '새 일기장 생성' 버튼 영역 */}
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#9B7348] uppercase mb-1.5">
              MY DIARY ARCHIVE
            </p>
            <h1 className="font-['Noto_Serif_KR',serif] text-2xl sm:text-[30px] font-semibold text-[#2C221A] tracking-tight mb-1">
              나의 일기장 아카이브
            </h1>
            <p className="text-xs sm:text-[13px] text-[#7D6E60]">
              차곡차곡 쌓인 날들, 다시 꺼내보는 나의 이야기
            </p>
          </div>

          {/* 오른쪽 새 일기장 생성 버튼 */}
          <button
            type="button"
            onClick={(e) => handleNavigate(e, TEMP_ROUTES.diaryWrite, '새 일기장 작성하기')}
            className="self-start sm:self-auto h-10.5 px-5 rounded-xl bg-[#9B7348] hover:bg-[#87623B] text-white text-xs sm:text-[13px] font-semibold flex items-center gap-2 shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            새 일기 작성하기
          </button>
        </section>

        {/* 일기장 검색창 및 정렬 옵션 영역 */}
        <section className="mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            {/* 검색 입력창 */}
            <div className="relative flex-1">
              <svg
                className="w-4 h-4 text-[#9E9286] absolute left-4 top-1/2 -translate-y-1/2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="일기 제목이나 내용을 입력하세요"
                className="w-full h-11 pl-11 pr-10 text-xs sm:text-[13px] bg-white border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-[#9E9286] hover:text-[#2C221A] cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 정렬 선택 (기본값: 최신순) */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSortOrder('latest')}
                className={`h-11 px-4 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  sortOrder === 'latest'
                    ? 'bg-[#2C221A] text-[#FAF6F0] border-[#2C221A]'
                    : 'bg-white text-[#6E5D4F] border-[#E8E1D9] hover:border-[#9B7348]'
                }`}
              >
                최신순
              </button>
              <button
                type="button"
                onClick={() => setSortOrder('oldest')}
                className={`h-11 px-4 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  sortOrder === 'oldest'
                    ? 'bg-[#2C221A] text-[#FAF6F0] border-[#2C221A]'
                    : 'bg-white text-[#6E5D4F] border-[#E8E1D9] hover:border-[#9B7348]'
                }`}
              >
                오래된순
              </button>
            </div>
          </div>

          {/* 기간 탭 및 총 개수 안내 */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-b border-[#E8E1D9] pb-3">
            <div className="flex items-center gap-5 text-xs">
              {[
                { key: 'all' as const, label: '전체 일기' },
                { key: 'recentMonth' as const, label: '최근 30일' },
                { key: 'thisYear' as const, label: '올해 기록' },
              ].map((tab) => {
                const isSelected = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`pb-1 transition-colors cursor-pointer ${
                      isSelected
                        ? 'font-bold text-[#2C221A] border-b-2 border-[#9B7348]'
                        : 'font-medium text-[#8C7A68] hover:text-[#2C221A]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-[#8C7A68]">
              총 <span className="font-bold text-[#2C221A]">{visibleDiaries.length}</span>개의 일기 ·{' '}
              {sortOrder === 'latest' ? '최신 작성순' : '오래된 작성순'}
            </p>
          </div>
        </section>

        {/* 저장된 일기장 최신순 카드 그리드 */}
        <section>
          {isLoading ? (
            <div className="w-full py-20 text-center text-xs text-[#8C7A68]">
              일기장 목록을 불러오는 중입니다...
            </div>
          ) : visibleDiaries.length === 0 ? (
            <div className="w-full py-20 bg-white/75 border border-[#E8E1D9] rounded-3xl text-center px-4">
              <p className="font-['Noto_Serif_KR',serif] text-base font-semibold text-[#3E2D1E] mb-1.5">
                {searchQuery
                  ? `'${searchQuery}'에 해당하는 일기가 없습니다.`
                  : '아직 작성된 일기가 없습니다.'}
              </p>
              <p className="text-xs text-[#8C7A68] mb-5">
                오른쪽 상단의 &apos;새 일기 작성하기&apos; 버튼을 눌러 첫 번째 이야기를 남겨보세요.
              </p>
              <button
                type="button"
                onClick={(e) => handleNavigate(e, TEMP_ROUTES.diaryWrite, '새 일기장 작성하기')}
                className="h-9.5 px-5 rounded-xl bg-[#9B7348] hover:bg-[#87623B] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                첫 일기 쓰러 가기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleDiaries.map((diary, index) => {
                const cover = CARD_COVERS[index % CARD_COVERS.length];
                return (
                  <article
                    key={diary.diary_id}
                    onClick={() => setSelectedDiary(diary)}
                    className="group bg-white hover:bg-[#FFFDF9] border border-[#E8E1D9] hover:border-[#C9B398] rounded-2xl overflow-hidden shadow-2xs hover:shadow-sm transition-all flex flex-col cursor-pointer"
                  >
                    {/* 카드 상단 감성 커버 일러스트 영역 */}
                    <div
                      className={`relative h-44 w-full bg-gradient-to-br ${cover.bg} overflow-hidden flex items-end p-4`}
                    >
                      {/* 은은한 배경 풍경 실루엣 */}
                      <svg
                        viewBox="0 0 320 160"
                        className="absolute inset-0 w-full h-full opacity-35 group-hover:scale-105 transition-transform duration-500"
                        preserveAspectRatio="none"
                      >
                        <circle cx="255" cy="42" r="24" fill="#FFFDF9" opacity="0.65" />
                        <path
                          d="M0 115 Q85 88 165 112 T320 100 L320 160 L0 160 Z"
                          fill={cover.accent}
                          opacity="0.45"
                        />
                        <path
                          d="M0 132 Q110 115 220 134 T320 124 L320 160 L0 160 Z"
                          fill={cover.accent}
                          opacity="0.7"
                        />
                      </svg>

                      {index === 0 && sortOrder === 'latest' && (
                        <span className="relative z-10 px-2.5 py-0.5 rounded-full bg-[#FAF6F0]/90 text-[#6E4E2E] text-[10px] font-bold tracking-wide shadow-2xs">
                          최신 기록
                        </span>
                      )}
                    </div>

                    {/* 카드 하단 텍스트 정보 */}
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-[#9E9286] mb-2">
                          <span>{formatDotDate(diary.created_at)}</span>
                          <svg
                            className="w-3.5 h-3.5 text-[#B5AAA0] group-hover:text-[#9B7348] transition-colors"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                          </svg>
                        </div>

                        <h2 className="font-['Noto_Serif_KR',serif] text-base font-semibold text-[#2C221A] group-hover:text-[#9B7348] transition-colors line-clamp-1 mb-2">
                          {diary.title}
                        </h2>

                        <p className="text-xs text-[#7D6E60] line-clamp-3 leading-relaxed">
                          {diary.content}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#F3EDE5] flex items-center justify-between text-[11px] text-[#9E9286]">
                        <span>{diary.content.length}자</span>
                        <span className="font-medium text-[#8C6842] group-hover:translate-x-0.5 transition-transform">
                          자세히 읽기 →
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* 일기 상세 조회 모달 (MEM-02) */}
      {selectedDiary && (
        <div
          onClick={() => setSelectedDiary(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] bg-[#FAF6F0] border border-[#E8E1D9] rounded-3xl p-7 sm:p-9 shadow-xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-[#9B7348]">
                {formatDotDate(selectedDiary.created_at)}
              </span>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setSelectedDiary(null)}
                className="text-[#8C7A68] hover:text-[#2C221A] text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <h2 className="font-['Noto_Serif_KR',serif] text-2xl font-bold text-[#2C221A] pb-4 mb-5 border-b border-[#E8E1D9]">
              {selectedDiary.title}
            </h2>

            <p className="text-sm text-[#3E2D1E] leading-8 whitespace-pre-wrap mb-8">
              {selectedDiary.content}
            </p>

            <div className="flex items-center justify-between pt-4 border-t border-[#E8E1D9]">
              <button
                type="button"
                onClick={() => handleDeleteDiary(selectedDiary.diary_id)}
                className="text-xs text-red-600 hover:underline cursor-pointer"
              >
                일기 삭제
              </button>

              <button
                type="button"
                onClick={() => setSelectedDiary(null)}
                className="h-9.5 px-5 rounded-xl bg-[#9B7348] hover:bg-[#87623B] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}