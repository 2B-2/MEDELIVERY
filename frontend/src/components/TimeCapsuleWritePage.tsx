import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
} from 'react';

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

interface UserProfile {
  user_id: number;
  account_id: string;
  username: string;
}

interface AttachedImage {
  id: string;
  name: string;
  previewUrl: string;
}

interface TimeCapsuleWritePageProps {
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

function getDefaultOpenDateString(): string {
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const yyyy = nextYear.getFullYear();
  const mm = String(nextYear.getMonth() + 1).padStart(2, '0');
  const dd = String(nextYear.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getTomorrowDateString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatKoreanDateText(dateString: string): string {
  if (!dateString) return '';
  const [yyyy, mm, dd] = dateString.split('-');
  if (!yyyy || !mm || !dd) return dateString;
  return `${yyyy}년 ${Number(mm)}월 ${Number(dd)}일`;
}

export default function TimeCapsuleWritePage({
  onLogout,
  onNavigate,
}: TimeCapsuleWritePageProps) {
  const [user, setUser] = useState<UserProfile | null>(null);

  // 타임캡슐 입력 상태 (schema_2.sql time_capsules: title, message, open_date)
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [openDate, setOpenDate] = useState<string>(() => getDefaultOpenDateString());

  // 사진 첨부 (최대 3장) & 음성 첨부 상태
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [attachedAudioName, setAttachedAudioName] = useState<string>('');
  const [isSealing, setIsSealing] = useState(false);

  const minDate = useMemo(() => getTomorrowDateString(), []);

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
    if (!token && onLogout) {
      onLogout();
    }
  }, [onLogout]);

  const displayName = user?.username || user?.account_id || '사용자';

  // 오늘로부터 개봉 지정일까지 남은 일수 계산
  const remainingDays = useMemo(() => {
    if (!openDate) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(`${openDate}T00:00:00`);
    if (Number.isNaN(target.getTime())) return 0;
    const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [openDate]);

  // 페이지 이동 핸들러
  const goToRoute = (path: string, label?: string) => {
    window.history.pushState({}, '', path);
    if (onNavigate && IMPLEMENTED_ROUTES.includes(path)) {
      onNavigate(path);
      return;
    }
    if (label) {
      alert(`'${label}' 화면으로 이동합니다. (${path})`);
    }
  };

  const handleHeaderLink = (
    e: MouseEvent<HTMLAnchorElement>,
    path: string,
    label: string
  ) => {
    e.preventDefault();
    goToRoute(path, label);
  };

  // 사진 첨부 핸들러 (JPG, PNG · 최대 3장)
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainSlots = 3 - attachedImages.length;
    if (remainSlots <= 0) {
      alert('사진은 최대 3장까지 첨부할 수 있습니다.');
      return;
    }

    const selectedFiles = files.slice(0, remainSlots);
    selectedFiles.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setAttachedImages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: file.name,
              previewUrl: reader.result as string,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleRemoveImage = (id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  };

  // 음성 첨부 핸들러 (MP3, M4A)
  const handleAudioChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachedAudioName(file.name);
    e.target.value = '';
  };

  // 타임캡슐 봉인하기 (CAP-01: POST /api/time-capsules) -> TimeCapsuleListPage로 이동
  const handleSealCapsule = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('캡슐 이름을 입력해 주세요.');
      return;
    }
    if (!message.trim()) {
      alert('전하고 싶은 이야기를 입력해 주세요.');
      return;
    }
    if (!openDate) {
      alert('봉인 해제일을 선택해 주세요.');
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      alert('로그인이 필요합니다.');
      if (onLogout) onLogout();
      return;
    }

    setIsSealing(true);
    const isoOpenDate = new Date(`${openDate}T00:00:00.000Z`).toISOString();

    try {
      const response = await fetch(`${API_BASE_URL}/time-capsules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          open_date: isoOpenDate,
        }),
      });

      if (response.status === 401) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        if (onLogout) onLogout();
        return;
      }

      const result = await response.json();
      if (!response.ok || !result.success) {
        alert(result?.error?.message || '타임캡슐 봉인 중 오류가 발생했습니다.');
        return;
      }

      alert(
        `"${title.trim()}" 타임캡슐이 안전하게 봉인되었습니다.\n${formatKoreanDateText(openDate)}에 열립니다.`
      );
      goToRoute(ROUTES.timeCapsules);
    } catch {
      alert('서버(http://3.26.210.69:4000)에 연결할 수 없어 타임캡슐을 봉인하지 못했습니다.');
    } finally {
      setIsSealing(false);
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
            onClick={(e) => handleHeaderLink(e, ROUTES.main, '메인 아카이브')}
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

          {/* 중앙 네비게이션 메뉴 ('타임캡슐' 활성화) */}
          <nav className="hidden md:flex items-center gap-8 text-[13px] font-medium">
            <a
              href={ROUTES.archive}
              onClick={(e) => handleHeaderLink(e, ROUTES.archive, '아카이브')}
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
              onClick={(e) => handleHeaderLink(e, ROUTES.diaries, '일기장')}
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
              onClick={(e) => handleHeaderLink(e, ROUTES.timeCapsules, '타임캡슐 전체보기')}
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
              onClick={(e) => handleHeaderLink(e, ROUTES.interviews, '자서전')}
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
                handleHeaderLink(e, ROUTES.profile, `${displayName}님 프로필 및 데드맨 스위치 설정`)
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
      <main className="max-w-[920px] mx-auto px-5 sm:px-8 py-9 sm:py-12">
        {/* 상단 타이틀 영역 */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold tracking-[0.14em] text-[#9B7348] uppercase">
              TIME CAPSULE
            </p>
            <button
              type="button"
              onClick={() => goToRoute(ROUTES.timeCapsules)}
              className="text-xs font-medium text-[#8C7A68] hover:text-[#2C221A] transition-colors cursor-pointer"
            >
              ← 타임캡슐 전체보기
            </button>
          </div>
          <h1 className="font-['Noto_Serif_KR',serif] text-2xl sm:text-[32px] font-semibold text-[#2C221A] tracking-tight mb-1.5">
            시간을 건너 도착할 마음
          </h1>
          <p className="text-xs sm:text-[13px] text-[#7D6E60]">
            지금의 마음을 담아 미래의 나에게 보내보세요.
          </p>
        </section>

        {/* 타임캡슐 작성 및 봉인 카드 */}
        <section className="bg-white border border-[#E8E1D9] rounded-[28px] p-6 sm:p-11 shadow-2xs">
          {/* 카드 상단 아이콘 & 타이틀 */}
          <div className="flex items-center gap-3.5 pb-6 mb-7 border-b border-[#F2ECE3]">
            <div className="w-11 h-11 rounded-full bg-[#9B7348] text-white flex items-center justify-center shrink-0 shadow-2xs">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                <line x1="16" y1="8" x2="2" y2="22" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#9B7348] uppercase mb-0.5">
                A LETTER TO THE FUTURE
              </p>
              <h2 className="font-['Noto_Serif_KR',serif] text-xl sm:text-2xl font-semibold text-[#2C221A]">
                미래의 나에게
              </h2>
            </div>
          </div>

          {/* 작성 폼 */}
          <form onSubmit={handleSealCapsule} className="space-y-6">
            {/* 1. 캡슐 이름 */}
            <div>
              <label
                htmlFor="capsule-title"
                className="block text-xs font-bold text-[#3E2D1E] mb-2"
              >
                캡슐 이름
              </label>
              <input
                id="capsule-title"
                type="text"
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="기억하고 싶은 순간의 이름"
                className="w-full h-12 px-4 text-xs sm:text-sm bg-[#FAF6F0]/70 border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] focus:bg-white transition-colors"
              />
            </div>

            {/* 2. 전하고 싶은 이야기 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="capsule-message"
                  className="block text-xs font-bold text-[#3E2D1E]"
                >
                  전하고 싶은 이야기
                </label>
                <span className="text-[11px] text-[#9E9286]">
                  {message.length}자
                </span>
              </div>
              <textarea
                id="capsule-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="미래의 나에게 전하고 싶은 이야기를 천천히 적어보세요..."
                rows={7}
                className="w-full p-4 text-xs sm:text-sm bg-[#FAF6F0]/70 border border-[#E8E1D9] rounded-2xl text-[#2C221A] placeholder:text-[#B5AAA0] leading-7 resize-none focus:outline-none focus:border-[#9B7348] focus:bg-white transition-colors"
              />
            </div>

            {/* 3. 사진 첨부 & 음성 첨부 2단 박스 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* 사진 첨부 */}
              <div>
                <label className="flex items-center justify-between p-4 rounded-2xl bg-[#FAF6F0]/80 hover:bg-[#F3ECE2] border border-[#E8E1D9] transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white border border-[#E8E1D9] flex items-center justify-center text-[#9B7348]">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#2C221A]">
                        사진 첨부 ({attachedImages.length}/3)
                      </p>
                      <p className="text-[11px] text-[#9E9286]">JPG, PNG · 최대 3장</p>
                    </div>
                  </div>
                  <span className="text-base text-[#8C7A68] font-medium">+</span>
                </label>

                {attachedImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {attachedImages.map((img) => (
                      <div
                        key={img.id}
                        className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#E8E1D9] group"
                      >
                        <img
                          src={img.previewUrl}
                          alt={img.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(img.id)}
                          aria-label="첨부 사진 삭제"
                          className="absolute inset-0 bg-black/45 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 음성 첨부 */}
              <div>
                <label className="flex items-center justify-between p-4 rounded-2xl bg-[#FAF6F0]/80 hover:bg-[#F3ECE2] border border-[#E8E1D9] transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept="audio/mp3,audio/mpeg,audio/mp4,audio/m4a,audio/*"
                    onChange={handleAudioChange}
                    className="hidden"
                  />
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white border border-[#E8E1D9] flex items-center justify-center text-[#9B7348]">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#2C221A]">음성 첨부</p>
                      <p className="text-[11px] text-[#9E9286]">MP3, M4A · 최대 5분</p>
                    </div>
                  </div>
                  <span className="text-base text-[#8C7A68] font-medium">+</span>
                </label>

                {attachedAudioName && (
                  <div className="mt-2.5 px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#E8E1D9] flex items-center justify-between text-[11px]">
                    <span className="text-[#5C4632] truncate max-w-[200px]">
                      🎵 {attachedAudioName}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachedAudioName('')}
                      className="text-red-600 font-semibold hover:underline cursor-pointer"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 4. 봉인 해제일 */}
            <div>
              <label
                htmlFor="capsule-open-date"
                className="block text-xs font-bold text-[#3E2D1E] mb-2"
              >
                봉인 해제일
              </label>
              <div className="relative">
                <input
                  id="capsule-open-date"
                  type="date"
                  min={minDate}
                  value={openDate}
                  onChange={(e) => setOpenDate(e.target.value)}
                  className="w-full h-12 px-4 text-xs sm:text-sm font-medium bg-[#FAF6F0]/70 border border-[#E8E1D9] rounded-xl text-[#2C221A] focus:outline-none focus:border-[#9B7348] focus:bg-white transition-colors"
                />
              </div>
              <p className="text-[11px] text-[#8C7A68] mt-2">
                {openDate
                  ? `${formatKoreanDateText(openDate)} · 오늘로부터 ${remainingDays}일 뒤, 캡슐이 열려요.`
                  : '개봉을 원하는 미래의 날짜를 선택해 주세요.'}
              </p>
            </div>

            {/* 5. 하단 중앙 원형 '타임캡슐 봉인하기' 버튼 */}
            <div className="pt-6 pb-2 flex flex-col items-center justify-center text-center">
              <button
                type="submit"
                disabled={isSealing}
                aria-label="타임캡슐 봉인하기"
                className="group flex flex-col items-center cursor-pointer disabled:opacity-60"
              >
                <span className="w-15 h-15 rounded-full bg-[#9B7348] group-hover:bg-[#87623B] group-active:scale-95 text-white flex items-center justify-center shadow-md transition-all mb-3">
                  <svg
                    className="w-6 h-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <span className="text-sm font-bold text-[#2C221A] group-hover:text-[#9B7348] transition-colors">
                  {isSealing ? '봉인하는 중...' : '타임캡슐 봉인하기'}
                </span>
                <span className="text-[11px] text-[#9E9286] mt-1">
                  봉인 후에는 공개일까지 열어볼 수 없어요
                </span>
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}