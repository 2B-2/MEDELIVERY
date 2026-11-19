import { useEffect, useMemo, useState, type MouseEvent } from 'react';

// 페이지 연결 경로 (구현 완료된 경로 및 임시 라우트 경로)
const TEMP_ROUTES = {
  main: '/main',
  archive: '/archive',
  diaries: '/diaries',
  diaryWrite: '/diaries/new',
  timeCapsules: '/time-capsules',
  timeCapsuleWrite: '/time-capsules/new',
  interviews: '/interviews',
  profile: '/profile',
} as const;

// 화면 전환이 연결된 경로 목록
const IMPLEMENTED_ROUTES: string[] = [
  TEMP_ROUTES.main,
  TEMP_ROUTES.archive,
  TEMP_ROUTES.diaries,
  TEMP_ROUTES.diaryWrite,
  TEMP_ROUTES.timeCapsules,
  TEMP_ROUTES.timeCapsuleWrite
];

// API 명세서 v2.0 기준 타입 정의
interface UserProfile {
  user_id: number;
  account_id: string;
  username: string;
  emergency_contact: string;
  inactivity_days: number;
  last_active_at: string;
}

interface DiaryItem {
  diary_id: number;
  user_id: number;
  title: string;
  content: string;
  created_at: string;
}

interface TimeCapsuleItem {
  capsule_id: number;
  user_id: number;
  title: string;
  message: string | null;
  open_date: string;
  is_opened: boolean;
}

interface InterviewItem {
  interview_id: number;
  user_id: number;
  chapter_name: string;
  created_at: string;
}

type ArchiveCategory = 'all' | 'diary' | 'capsule' | 'interview';

interface UnifiedArchiveCard {
  uid: string;
  id: number;
  category: Exclude<ArchiveCategory, 'all'>;
  categoryLabel: '일기' | '타임캡슐' | '자서전';
  title: string;
  preview: string;
  dateText: string;
  sortDate: number;
  isLocked?: boolean;
}

interface MainPageProps {
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

// 백엔드 미연결 시에도 화면을 바로 확인할 수 있는 초기 샘플 데이터 (v2.0 스키마 동일)
const MOCK_USER: UserProfile = {
  user_id: 1,
  account_id: 'fin_user',
  username: 'FIN',
  emergency_contact: '010-1234-5678',
  inactivity_days: 90,
  last_active_at: new Date().toISOString(),
};

const MOCK_DIARIES: DiaryItem[] = [
  {
    diary_id: 1,
    user_id: 1,
    title: '오랜만에 만난 우리',
    content: '한강 공원을 천천히 걸으며 그동안 나누지 못했던 이야기를 오래도록 나누었다.',
    created_at: '2026-11-15T14:20:00.000Z',
  },
  {
    diary_id: 2,
    user_id: 1,
    title: '봄을 기다리는 오후',
    content: '창가로 들어오는 햇살이 유난히 따뜻해서 좋아하는 음악을 틀어두고 차를 마셨다.',
    created_at: '2026-11-10T09:30:00.000Z',
  },
];

const MOCK_CAPSULES: TimeCapsuleItem[] = [
  {
    capsule_id: 1,
    user_id: 1,
    title: '서른의 나에게',
    message: null,
    open_date: '2028-02-20T00:00:00.000Z',
    is_opened: false,
  },
  {
    capsule_id: 2,
    user_id: 1,
    title: '우리의 10주년',
    message: '함께 걸어온 모든 계절에 고마움을 담아 이 편지를 남깁니다.',
    open_date: '2026-10-01T00:00:00.000Z',
    is_opened: true,
  },
];

const MOCK_INTERVIEWS: InterviewItem[] = [
  {
    interview_id: 1,
    user_id: 1,
    chapter_name: '나의 찬란했던 스무 살',
    created_at: '2026-11-12T18:00:00.000Z',
  },
  {
    interview_id: 2,
    user_id: 1,
    chapter_name: '어린 날의 여름',
    created_at: '2026-11-05T11:15:00.000Z',
  },
];

const API_BASE_URL = 'http://localhost:4000/api';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

export default function MainPage({ onLogout, onNavigate }: MainPageProps) {
  const [user, setUser] = useState<UserProfile>(MOCK_USER);
  const [diaries, setDiaries] = useState<DiaryItem[]>(MOCK_DIARIES);
  const [capsules, setCapsules] = useState<TimeCapsuleItem[]>(MOCK_CAPSULES);
  const [interviews, setInterviews] = useState<InterviewItem[]>(MOCK_INTERVIEWS);

  // 히어로 배너 슬라이드 상태
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isBannerPaused, setIsBannerPaused] = useState(false);

  // 아카이브 필터 및 검색 상태
  const [activeTab, setActiveTab] = useState<ArchiveCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 로그인 토큰이 있으면 백엔드 API(v2.0)에서 실제 데이터 불러오기
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const savedUser = localStorage.getItem('user');

    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser((prev) => ({ ...prev, ...parsed }));
      } catch {
        // 파싱 실패 시 기본값 유지
      }
    }

    if (!token) return;

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const fetchArchiveData = async () => {
      try {
        const [meRes, diariesRes, capsulesRes, interviewsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/auth/me`, { headers }),
          fetch(`${API_BASE_URL}/diaries`, { headers }),
          fetch(`${API_BASE_URL}/time-capsules`, { headers }),
          fetch(`${API_BASE_URL}/interviews`, { headers }),
        ]);

        if (meRes.ok) {
          const meJson = await meRes.json();
          if (meJson.success && meJson.data) setUser(meJson.data);
        }
        if (diariesRes.ok) {
          const diariesJson = await diariesRes.json();
          if (diariesJson.success && Array.isArray(diariesJson.data)) setDiaries(diariesJson.data);
        }
        if (capsulesRes.ok) {
          const capsulesJson = await capsulesRes.json();
          if (capsulesJson.success && Array.isArray(capsulesJson.data)) setCapsules(capsulesJson.data);
        }
        if (interviewsRes.ok) {
          const interviewsJson = await interviewsRes.json();
          if (interviewsJson.success && Array.isArray(interviewsJson.data)) setInterviews(interviewsJson.data);
        }
      } catch {
        // 백엔드 서버가 아직 꺼져 있을 경우 샘플 데이터 유지
      }
    };

    fetchArchiveData();
  }, []);

  // 움직이는 배너 슬라이드 데이터
  const bannerSlides = useMemo(
    () => [
      {
        id: 'welcome',
        eyebrow: 'TODAY WITH MEDELIVERY',
        title: `${user.username || 'FIN'}님, 오늘도 좋은 하루예요.`,
        subtitle: '평범한 오늘도 기록하면 특별한 이야기가 돼요.',
      },
      {
        id: 'deadman',
        eyebrow: `DEADMAN SWITCH · ${user.inactivity_days}일 기준 활성화`,
        title: '데드맨 스위치',
        subtitle: '오늘의 접속으로 활동 시각이 안전하게 갱신되었어요. 소중한 기록이 보호되고 있습니다.',
      },
    ],
    [user.username, user.inactivity_days]
  );

  // 배너 자동 슬라이드 타이머 (4.5초 간격)
  useEffect(() => {
    if (isBannerPaused) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % bannerSlides.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [bannerSlides.length, isBannerPaused]);

  // 전체 / 일기 / 타임캡슐 / 자서전 통합 리스트 변환
  const allItems: UnifiedArchiveCard[] = useMemo(() => {
    const mappedDiaries: UnifiedArchiveCard[] = diaries.map((item) => ({
      uid: `diary-${item.diary_id}`,
      id: item.diary_id,
      category: 'diary',
      categoryLabel: '일기',
      title: item.title,
      preview: item.content,
      dateText: formatDate(item.created_at),
      sortDate: new Date(item.created_at).getTime() || 0,
    }));

    const mappedCapsules: UnifiedArchiveCard[] = capsules.map((item) => ({
      uid: `capsule-${item.capsule_id}`,
      id: item.capsule_id,
      category: 'capsule',
      categoryLabel: '타임캡슐',
      title: item.title,
      preview: item.is_opened
        ? item.message || '개봉된 타임캡슐입니다.'
        : `개봉 지정일(${formatDate(item.open_date)})까지 봉인된 타임캡슐입니다.`,
      dateText: `개봉일 ${formatDate(item.open_date)}`,
      sortDate: new Date(item.open_date).getTime() || 0,
      isLocked: !item.is_opened,
    }));

    const mappedInterviews: UnifiedArchiveCard[] = interviews.map((item) => ({
      uid: `interview-${item.interview_id}`,
      id: item.interview_id,
      category: 'interview',
      categoryLabel: '자서전',
      title: item.chapter_name,
      preview: 'AI와 함께 기록한 나의 자서전 인터뷰 단원입니다.',
      dateText: formatDate(item.created_at),
      sortDate: new Date(item.created_at).getTime() || 0,
    }));

    return [...mappedDiaries, ...mappedCapsules, ...mappedInterviews].sort(
      (a, b) => b.sortDate - a.sortDate
    );
  }, [diaries, capsules, interviews]);

  // 선택된 탭과 검색어에 따른 필터링
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const matchesTab = activeTab === 'all' || item.category === activeTab;
      const matchesQuery =
        searchQuery.trim() === '' ||
        item.title.toLowerCase().includes(searchQuery.trim().toLowerCase());
      return matchesTab && matchesQuery;
    });
  }, [allItems, activeTab, searchQuery]);

  // 페이지 이동 핸들러 (연결된 경로는 즉시 전환, 미구현 경로는 임시 안내)
  const handleNavigate = (
    e: MouseEvent<HTMLAnchorElement | HTMLButtonElement>,
    path: string,
    label: string
  ) => {
    e.preventDefault();
    window.history.pushState({}, '', path);

    if (onNavigate && IMPLEMENTED_ROUTES.includes(path)) {
      onNavigate(path);
      return;
    }

    alert(`'${label}' 화면으로 이동합니다. (임시 연결 경로: ${path})`);
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF6F0] text-[#2C221A] font-['Noto_Sans_KR',sans-serif]">
      {/* 상단 고정 헤더 */}
      <header className="sticky top-0 z-30 w-full bg-[#FAF6F0]/95 backdrop-blur-sm border-b border-[#E8E1D9]">
        <div className="max-w-[1040px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          {/* 왼쪽 로고 */}
          <a
            href={TEMP_ROUTES.archive}
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('all');
              window.history.pushState({}, '', TEMP_ROUTES.archive);
            }}
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

          {/* 중앙 네비게이션 메뉴 */}
          <nav className="hidden md:flex items-center gap-7 text-[13px] font-medium">
            <a
              href={TEMP_ROUTES.archive}
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('all');
                window.history.pushState({}, '', TEMP_ROUTES.archive);
              }}
              className="flex items-center gap-1.5 text-[#2C221A] font-semibold border-b-2 border-[#9B7348] py-5"
            >
              <svg className="w-3.5 h-3.5 text-[#9B7348]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
              </svg>
              아카이브
            </a>

            <a
              href={TEMP_ROUTES.diaries}
              onClick={(e) => handleNavigate(e, TEMP_ROUTES.diaries, '일기장')}
              className="flex items-center gap-1.5 text-[#7D6E60] hover:text-[#2C221A] transition-colors py-5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              onClick={(e) => handleNavigate(e, TEMP_ROUTES.profile, `${user.username}님 프로필 및 데드맨 스위치 설정`)}
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
      <main className="max-w-[1040px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
        {/* 1. 움직이는 히어로 배너 */}
        <section
          onMouseEnter={() => setIsBannerPaused(true)}
          onMouseLeave={() => setIsBannerPaused(false)}
          className="relative w-full overflow-hidden rounded-3xl border border-[#E5D5C0] shadow-xs mb-11"
          style={{
            background: 'linear-gradient(125deg, #EAD8C3 0%, #F5ECE0 48%, #E3C7A6 100%)',
          }}
        >
          {/* 슬라이드 트랙 */}
          <div
            className="flex transition-transform duration-700 ease-in-out"
            style={{ transform: `translateX(-${currentSlide * 100}%)` }}
          >
            {bannerSlides.map((slide) => (
              <div
                key={slide.id}
                className="w-full shrink-0 px-7 sm:px-12 py-9 sm:py-11 flex flex-col justify-between"
              >
                <div>
                  <p className="text-[10px] sm:text-[11px] font-semibold tracking-[0.14em] text-[#8C6842] uppercase mb-2.5">
                    {slide.eyebrow}
                  </p>
                  <h1 className="font-['Noto_Serif_KR',serif] text-2xl sm:text-[32px] font-semibold text-[#2C221A] tracking-tight leading-snug mb-2">
                    {slide.title}
                  </h1>
                  <p className="text-xs sm:text-sm text-[#6E5D4F] mb-7">
                    {slide.subtitle}
                  </p>
                </div>

                {/* 배너 하단 액션 버튼 2개 */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => handleNavigate(e, TEMP_ROUTES.diaryWrite, '오늘의 일기 쓰기')}
                    className="h-10 px-5 rounded-xl bg-[#9B7348] hover:bg-[#87623B] text-white text-xs sm:text-[13px] font-semibold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                      <line x1="16" y1="8" x2="2" y2="22" />
                      <line x1="17.5" y1="15" x2="9" y2="15" />
                    </svg>
                    오늘의 일기 쓰기
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleNavigate(e, TEMP_ROUTES.timeCapsuleWrite, '타임캡슐 만들기')}
                    className="h-10 px-5 rounded-xl bg-[#FAF6F0]/80 hover:bg-[#FAF6F0] text-[#5C4632] border border-[#DFCBB3] text-xs sm:text-[13px] font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 text-[#9B7348]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.5 20.5 19 12a4.95 4.95 0 1 0-7-7L3.5 13.5a4.95 4.95 0 1 0 7 7Z" />
                      <path d="m8.5 8.5 7 7" />
                    </svg>
                    타임캡슐 만들기
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 배너 우측 하단 슬라이드 인디케이터 */}
          <div className="absolute bottom-5 right-6 flex items-center gap-2">
            {bannerSlides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`${idx + 1}번 배너 보기`}
                onClick={() => setCurrentSlide(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  currentSlide === idx
                    ? 'w-6 bg-[#9B7348]'
                    : 'w-2 bg-[#9B7348]/35 hover:bg-[#9B7348]/60'
                }`}
              />
            ))}
          </div>
        </section>

        {/* 2. 나의 아카이브 섹션 */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-[#9B7348] uppercase mb-1">
                MY MEMORIES
              </p>
              <h2 className="font-['Noto_Serif_KR',serif] text-xl sm:text-2xl font-semibold text-[#2C221A]">
                나의 아카이브
              </h2>
            </div>

            {/* 제목 검색창 */}
            <div className="relative w-full sm:w-64">
              <svg
                className="w-3.5 h-3.5 text-[#9E9286] absolute left-3.5 top-1/2 -translate-y-1/2"
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
                placeholder="글 제목으로 검색..."
                className="w-full h-9.5 pl-9 pr-3.5 text-xs bg-white border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] transition-colors"
              />
            </div>
          </div>

          {/* 카테고리 필터 탭 (전체 / 일기 / 타임캡슐 / 자서전) */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {[
              { key: 'all' as const, label: '전체', count: allItems.length },
              { key: 'diary' as const, label: '일기', count: diaries.length },
              { key: 'capsule' as const, label: '타임캡슐', count: capsules.length },
              { key: 'interview' as const, label: '자서전', count: interviews.length },
            ].map((tab) => {
              const isSelected = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`h-8.5 px-4 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#2C221A] text-[#FAF6F0] border-[#2C221A]'
                      : 'bg-white text-[#6E5D4F] border-[#E8E1D9] hover:border-[#9B7348]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[11px] ${
                      isSelected ? 'text-[#DFC498]' : 'text-[#9E9286]'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 필터링된 아카이브 카드 그리드 */}
          {filteredItems.length === 0 ? (
            <div className="w-full py-16 bg-white/70 border border-[#E8E1D9] rounded-2xl text-center">
              <p className="text-sm font-medium text-[#7D6E60] mb-1">
                표시할 기록이 없습니다.
              </p>
              <p className="text-xs text-[#9E9286]">
                새로운 일기나 타임캡슐을 작성해 첫 번째 이야기를 채워보세요.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredItems.map((item) => (
                <article
                  key={item.uid}
                  onClick={() => {
                    if (item.category === 'diary' && onNavigate) {
                      window.history.pushState({}, '', TEMP_ROUTES.diaries);
                      onNavigate(TEMP_ROUTES.diaries);
                      return;
                    }
                    alert(`[${item.categoryLabel}] "${item.title}" 상세 페이지로 연결됩니다.`);
                  }}
                  className="group bg-white hover:bg-[#FFFDF9] border border-[#E8E1D9] hover:border-[#C9B398] rounded-2xl p-4 flex items-center gap-4 shadow-2xs transition-all cursor-pointer"
                >
                  {/* 왼쪽 카테고리별 컬러 아이콘 썸네일 */}
                  <div
                    className={`w-20 h-20 sm:w-22 sm:h-22 rounded-xl shrink-0 flex items-center justify-center transition-transform group-hover:scale-[1.02] ${
                      item.category === 'diary'
                        ? 'bg-[#D9B5A0] text-[#5C3D2E]'
                        : item.category === 'capsule'
                        ? 'bg-[#DFC497] text-[#5E4623]'
                        : 'bg-[#B8C4CE] text-[#354656]'
                    }`}
                  >
                    {item.category === 'diary' && (
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                        <line x1="16" y1="8" x2="2" y2="22" />
                        <line x1="17.5" y1="15" x2="9" y2="15" />
                      </svg>
                    )}

                    {item.category === 'capsule' && (
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    )}

                    {item.category === 'interview' && (
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                    )}
                  </div>

                  {/* 오른쪽 카드 텍스트 정보 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          item.category === 'diary'
                            ? 'bg-[#F5E9E2] text-[#8C583E]'
                            : item.category === 'capsule'
                            ? 'bg-[#F6EEDC] text-[#8A662E]'
                            : 'bg-[#E9EEF2] text-[#455A6B]'
                        }`}
                      >
                        {item.categoryLabel}
                      </span>
                      <span className="text-[11px] text-[#9E9286] shrink-0">
                        {item.dateText}
                      </span>
                    </div>

                    <h3 className="font-['Noto_Serif_KR',serif] text-[15px] font-semibold text-[#2C221A] truncate mb-1 group-hover:text-[#9B7348] transition-colors">
                      {item.title}
                    </h3>

                    <p className="text-xs text-[#7D6E60] line-clamp-2 leading-relaxed">
                      {item.preview}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}