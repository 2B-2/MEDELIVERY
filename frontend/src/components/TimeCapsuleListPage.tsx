import { useEffect, useMemo, useState, type MouseEvent } from 'react';

// 페이지 이동 경로 (API 명세서 v2.0 기준)
const ROUTES = {
  main: '/main',
  archive: '/archive',
  diaries: '/diaries',
  timeCapsules: '/time-capsules',
  timeCapsuleWrite: '/time-capsules/new',
  interviews: '/interviews',
  profile: '/profile',
} as const;

const IMPLEMENTED_ROUTES: string[] = [
  ROUTES.main,
  ROUTES.archive,
  ROUTES.diaries,
  ROUTES.timeCapsules,
  ROUTES.timeCapsuleWrite,
  ROUTES.interviews,
  ROUTES.profile,
];

const API_BASE_URL = 'http://3.26.210.69:4000/api';

// API 명세서 v2.0 기준 타입 정의 (CAP-02: time_capsules)
interface UserProfile {
  user_id: number;
  account_id: string;
  username: string;
}

interface TimeCapsuleItem {
  capsule_id: number;
  user_id: number;
  title: string;
  message: string | null;
  open_date: string;
  is_opened: boolean;
  access_code?: string | null;
}

interface TimeCapsuleListPageProps {
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

function formatDotDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}. ${mm}. ${dd}`;
}

function getRemainingDaysText(openDateString: string): string {
  const target = new Date(openDateString).getTime();
  const now = Date.now();
  if (Number.isNaN(target)) return '';
  const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return '개봉 가능';
  return `D-${diffDays}`;
}

export default function TimeCapsuleListPage({
  onLogout,
  onNavigate,
}: TimeCapsuleListPageProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [capsules, setCapsules] = useState<TimeCapsuleItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string>('');

  // 검색 및 정렬 상태 (기본값: 최신순 'latest')
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest'>('latest');

  // 상세 열람 모달 상태
  const [openedModalCapsule, setOpenedModalCapsule] = useState<TimeCapsuleItem | null>(null);
  const [sealedNoticeCapsule, setSealedNoticeCapsule] = useState<{
    capsule: TimeCapsuleItem;
    reason: string;
  } | null>(null);
  const [isCheckingDetail, setIsCheckingDetail] = useState(false);

  // 사용자 정보 및 타임캡슐 목록 조회 (CAP-02: GET /api/time-capsules)
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        // 파싱 실패 시 무시
      }
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      setIsLoading(false);
      if (onLogout) onLogout();
      return;
    }

    const fetchCapsules = async () => {
      setIsLoading(true);
      setFetchError('');
      try {
        const response = await fetch(`${API_BASE_URL}/time-capsules`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status === 401) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('user');
          if (onLogout) onLogout();
          return;
        }

        const result = await response.json();
        if (response.ok && result.success && Array.isArray(result.data)) {
          setCapsules(result.data);
        } else {
          setFetchError(
            result?.error?.message || '타임캡슐 목록을 불러오지 못했습니다.'
          );
        }
      } catch {
        setFetchError(
          '서버(http://3.26.210.69:4000)에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchCapsules();
  }, [onLogout]);

  const displayName = user?.username || user?.account_id || '사용자';

  // 검색어 필터링 및 저장된 최신순 정렬 (capsule_id 내림차순)
  const visibleCapsules = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return capsules
      .filter((item) => {
        if (!keyword) return true;
        const inTitle = item.title.toLowerCase().includes(keyword);
        const inMessage =
          item.is_opened && item.message
            ? item.message.toLowerCase().includes(keyword)
            : false;
        return inTitle || inMessage;
      })
      .sort((a, b) =>
        sortOrder === 'latest'
          ? b.capsule_id - a.capsule_id
          : a.capsule_id - b.capsule_id
      );
  }, [capsules, searchQuery, sortOrder]);

  // 페이지 이동 핸들러
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

    alert(`'${label}' 화면으로 이동합니다. (${path})`);
  };

  // 타임캡슐 카드 클릭 시 조건부 개봉 제어 및 상세 조회 (CAP-02: GET /api/time-capsules/:capsule_id)
  const handleOpenCapsule = async (capsule: TimeCapsuleItem) => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      if (onLogout) onLogout();
      return;
    }

    setIsCheckingDetail(true);
    try {
      const response = await fetch(`${API_BASE_URL}/time-capsules/${capsule.capsule_id}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        if (onLogout) onLogout();
        return;
      }

      const result = await response.json();

      if (response.ok && result.success && result.data) {
        setCapsules((prev) =>
          prev.map((item) =>
            item.capsule_id === capsule.capsule_id ? result.data : item
          )
        );
        setOpenedModalCapsule(result.data);
        return;
      }

      if (response.status === 403) {
        setSealedNoticeCapsule({
          capsule,
          reason:
            result?.error?.message ||
            `아직 개봉 지정일(${formatDotDate(capsule.open_date)})이 도래하지 않아 열람할 수 없습니다.`,
        });
        return;
      }

      alert(result?.error?.message || '타임캡슐 정보를 확인하지 못했습니다.');
    } catch {
      alert('서버(http://3.26.210.69:4000)에 연결할 수 없습니다.');
    } finally {
      setIsCheckingDetail(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF6F0] text-[#2C221A] font-['Noto_Sans_KR',sans-serif]">
      {/* 상단 고정 헤더 */}
      <header className="sticky top-0 z-30 w-full bg-[#FAF6F0]/95 backdrop-blur-sm border-b border-[#E8E1D9]">
        <div className="max-w-[1040px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          {/* 왼쪽 로고 */}
          <a
            href={ROUTES.main}
            onClick={(e) => handleNavigate(e, ROUTES.main, '메인 아카이브')}
            className="flex items-center gap-2.5"
          >
            <div className="w-7 h-7 rounded-full bg-[#9B7348] flex items-center justify-center text-[#FAF6F0] shadow-xs">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                <line x1="16" y1="8" x2="2" y2="22" />
              </svg>
            </div>
            <span className="font-['Noto_Serif_KR',serif] text-[15px] font-bold tracking-wider text-[#2C221A]">
              MEDELIVERY
            </span>
          </a>

          {/* 중앙 네비게이션 메뉴 ('타임캡슐' 활성화 상태) */}
          <nav className="hidden md:flex items-center gap-8 text-[13px] font-medium">
            <a
              href={ROUTES.archive}
              onClick={(e) => handleNavigate(e, ROUTES.archive, '아카이브')}
              className="flex items-center gap-1.5 text-[#7D6E60] hover:text-[#2C221A] transition-colors py-5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
              </svg>
              아카이브
            </a>

            <a
              href={ROUTES.diaries}
              onClick={(e) => handleNavigate(e, ROUTES.diaries, '일기장')}
              className="flex items-center gap-1.5 text-[#7D6E60] hover:text-[#2C221A] transition-colors py-5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              일기
            </a>

            <a
              href={ROUTES.timeCapsules}
              onClick={(e) => {
                e.preventDefault();
                setSearchQuery('');
              }}
              className="flex items-center gap-1.5 text-[#2C221A] font-semibold border-b-2 border-[#9B7348] py-5"
            >
              <svg className="w-3.5 h-3.5 text-[#9B7348]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              타임캡슐
            </a>

            <a
              href={ROUTES.interviews}
              onClick={(e) => handleNavigate(e, ROUTES.interviews, '자서전')}
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
              href={ROUTES.profile}
              onClick={(e) =>
                handleNavigate(e, ROUTES.profile, `${displayName}님 프로필 및 데드맨 스위치 설정`)
              }
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-[#F2ECE3] hover:bg-[#E8DFD2] border border-[#E8E1D9] transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-[#9B7348] text-white text-[11px] font-bold flex items-center justify-center">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-xs font-semibold text-[#3E2D1E]">
                {displayName}님
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
        {fetchError && (
          <div className="mb-6 p-3.5 rounded-2xl bg-[#FCEEEA] border border-[#F3D1C8] text-xs text-[#A84A3A] font-medium">
            {fetchError}
          </div>
        )}

        {/* 상단 타이틀 & 오른쪽 '+ 새 캡슐 만들기' 버튼 */}
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <p className="text-[10px] font-bold tracking-[0.14em] text-[#9B7348] uppercase mb-1.5">
              TIME CAPSULE ARCHIVE
            </p>
            <h1 className="font-['Noto_Serif_KR',serif] text-2xl sm:text-[30px] font-semibold text-[#2C221A] tracking-tight mb-1">
              나의 타임캡슐
            </h1>
            <p className="text-xs sm:text-[13px] text-[#7D6E60]">
              미래로 보낸 마음부터 다시 꺼내 읽을 추억까지, 한곳에 모았어요.
            </p>
          </div>

          <button
            type="button"
            onClick={(e) => handleNavigate(e, ROUTES.timeCapsuleWrite, '새 타임캡슐 만들기')}
            className="self-start sm:self-auto h-10.5 px-5 rounded-xl bg-[#9B7348] hover:bg-[#87623B] text-white text-xs sm:text-[13px] font-semibold flex items-center gap-2 shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            새 캡슐 만들기
          </button>
        </section>

        {/* 봉인 안내 배너 */}
        <div className="w-full rounded-xl bg-[#F3ECE2] border border-[#E6DACB] px-4 py-3 flex items-center gap-2.5 text-xs text-[#6E5D4F] mb-7">
          <svg className="w-3.5 h-3.5 text-[#9B7348] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>
            봉인 중에는 공개일까지 열어볼 수 없어요. 봉인 중인 캡슐은 제목과 개봉 지정일만 확인할 수 있어요.
          </span>
        </div>

        {/* 타임캡슐 검색창 및 최신순 정렬 바 */}
        <section className="mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
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
                placeholder="캡슐 이름으로 검색해보세요"
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

            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
              <span className="text-xs text-[#8C7A68]">
                총 <strong className="text-[#2C221A]">{visibleCapsules.length}</strong>개의 캡슐
              </span>

              <select
                aria-label="타임캡슐 정렬 기준"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'latest' | 'oldest')}
                className="h-11 px-3.5 rounded-xl bg-white border border-[#E8E1D9] text-xs font-semibold text-[#3E2D1E] focus:outline-none focus:border-[#9B7348] cursor-pointer"
              >
                <option value="latest">저장 최신순</option>
                <option value="oldest">저장 오래된순</option>
              </select>
            </div>
          </div>
        </section>

        {/* 타임캡슐 카드 그리드 */}
        <section>
          {isLoading ? (
            <div className="w-full py-20 text-center text-xs text-[#8C7A68]">
              타임캡슐 목록을 불러오는 중입니다...
            </div>
          ) : visibleCapsules.length === 0 ? (
            <div className="w-full py-20 bg-white/75 border border-[#E8E1D9] rounded-3xl text-center px-4">
              <p className="font-['Noto_Serif_KR',serif] text-base font-semibold text-[#3E2D1E] mb-1.5">
                {searchQuery
                  ? `'${searchQuery}'에 해당하는 타임캡슐이 없습니다.`
                  : '아직 봉인된 타임캡슐이 없습니다.'}
              </p>
              <p className="text-xs text-[#8C7A68] mb-5">
                오른쪽 상단의 &apos;새 캡슐 만들기&apos; 버튼을 눌러 미래로 보낼 첫 번째 마음을 남겨보세요.
              </p>
              <button
                type="button"
                onClick={(e) => handleNavigate(e, ROUTES.timeCapsuleWrite, '새 타임캡슐 만들기')}
                className="h-9.5 px-5 rounded-xl bg-[#9B7348] hover:bg-[#87623B] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                새 캡슐 만들기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {visibleCapsules.map((capsule) => {
                const isSealed = !capsule.is_opened;

                return isSealed ? (
                  <article
                    key={capsule.capsule_id}
                    onClick={() => handleOpenCapsule(capsule)}
                    className="group relative overflow-hidden rounded-3xl p-6 sm:p-7 border border-[#B9A286] shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[250px]"
                    style={{
                      background:
                        'linear-gradient(135deg, #8B7156 0%, #A98E70 55%, #C9B396 100%)',
                    }}
                  >
                    <div className="pointer-events-none absolute -right-12 -bottom-12 w-48 h-48 rounded-full bg-white/10" />

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-4">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3A2B1D]/45 text-[#FAF6F0] text-[11px] font-semibold">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          봉인 중
                        </span>

                        <span className="text-[10px] font-bold tracking-[0.14em] text-[#FAF6F0]/80 uppercase">
                          TO THE FUTURE · {getRemainingDaysText(capsule.open_date)}
                        </span>
                      </div>

                      <h2 className="font-['Noto_Serif_KR',serif] text-xl sm:text-2xl font-semibold text-white mb-2 group-hover:translate-x-0.5 transition-transform">
                        {capsule.title}
                      </h2>

                      <div className="mt-4 rounded-xl bg-black/15 border border-white/15 px-3.5 py-2.5 text-xs text-[#FAF6F0]/90 flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <span>본문은 개봉 지정일까지 안전하게 봉인되어 있어요</span>
                      </div>
                    </div>

                    <div className="relative z-10 mt-6 pt-4 border-t border-white/20 flex items-center justify-between text-xs text-[#FAF6F0]">
                      <div>
                        <span className="text-[#FAF6F0]/75 mr-2">개봉 지정일</span>
                        <strong className="font-semibold">
                          {formatDotDate(capsule.open_date)}
                        </strong>
                      </div>

                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-[11px] font-semibold">
                        공개 대기 중
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                    </div>
                  </article>
                ) : (
                  <article
                    key={capsule.capsule_id}
                    onClick={() => handleOpenCapsule(capsule)}
                    className="group bg-white hover:bg-[#FFFDF9] border border-[#E8E1D9] hover:border-[#C9B398] rounded-3xl p-6 sm:p-7 shadow-2xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between min-h-[250px]"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-4">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFE7DC] text-[#7A5734] text-[11px] font-semibold">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          공개 완료
                        </span>

                        <span className="text-[10px] font-bold tracking-[0.14em] text-[#9E9286] uppercase">
                          ARRIVED
                        </span>
                      </div>

                      <h2 className="font-['Noto_Serif_KR',serif] text-xl sm:text-2xl font-semibold text-[#2C221A] group-hover:text-[#9B7348] transition-colors mb-2">
                        {capsule.title}
                      </h2>

                      <p className="text-xs text-[#7D6E60] line-clamp-2 leading-relaxed mb-3">
                        {capsule.message}
                      </p>

                      <div className="rounded-xl bg-[#FAF6F0] border border-[#EFE8DE] px-3.5 py-2 text-[11px] font-medium text-[#7A5734] flex items-center gap-1.5">
                        <span>✓ 기다리던 마음이 도착했어요</span>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-[#F2ECE3] flex items-center justify-between text-xs">
                      <div className="text-[#8C7A68]">
                        <span className="mr-2">개봉일</span>
                        <strong className="font-semibold text-[#3E2D1E]">
                          {formatDotDate(capsule.open_date)}
                        </strong>
                      </div>

                      <span className="font-semibold text-[#9B7348] group-hover:translate-x-0.5 transition-transform">
                        {isCheckingDetail ? '확인 중...' : '내용 보기 →'}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* 1) 공개 완료 캡슐 상세 열람 모달 (CAP-02: 200 OK) */}
      {openedModalCapsule && (
        <div
          onClick={() => setOpenedModalCapsule(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[540px] bg-[#FAF6F0] border border-[#E8E1D9] rounded-3xl p-7 sm:p-9 shadow-xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-1 rounded-full bg-[#EFE7DC] text-[#7A5734] text-[11px] font-semibold">
                개봉일 {formatDotDate(openedModalCapsule.open_date)}
              </span>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setOpenedModalCapsule(null)}
                className="text-[#8C7A68] hover:text-[#2C221A] text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <h2 className="font-['Noto_Serif_KR',serif] text-2xl font-bold text-[#2C221A] pb-4 mb-5 border-b border-[#E8E1D9]">
              {openedModalCapsule.title}
            </h2>

            <p className="text-sm text-[#3E2D1E] leading-8 whitespace-pre-wrap mb-8">
              {openedModalCapsule.message}
            </p>

            <div className="flex justify-end pt-4 border-t border-[#E8E1D9]">
              <button
                type="button"
                onClick={() => setOpenedModalCapsule(null)}
                className="h-9.5 px-6 rounded-xl bg-[#9B7348] hover:bg-[#87623B] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2) 봉인 중인 캡슐 열람 제한 안내 모달 (CAP-02: 403 Forbidden) */}
      {sealedNoticeCapsule && (
        <div
          onClick={() => setSealedNoticeCapsule(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] bg-[#FAF6F0] border border-[#E8E1D9] rounded-3xl p-7 text-center shadow-xl"
          >
            <div className="w-12 h-12 rounded-full bg-[#EFE7DC] text-[#9B7348] flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            <p className="text-[11px] font-bold tracking-[0.12em] text-[#9B7348] uppercase mb-1">
              SEALED TIME CAPSULE
            </p>
            <h3 className="font-['Noto_Serif_KR',serif] text-xl font-bold text-[#2C221A] mb-2">
              {sealedNoticeCapsule.capsule.title}
            </h3>
            <p className="text-xs text-[#6E5D4F] leading-relaxed mb-6">
              {sealedNoticeCapsule.reason}
            </p>

            <button
              type="button"
              onClick={() => setSealedNoticeCapsule(null)}
              className="w-full h-10 rounded-xl bg-[#9B7348] hover:bg-[#87623B] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}