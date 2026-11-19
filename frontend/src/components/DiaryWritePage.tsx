import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
} from 'react';

// 페이지 이동 경로 (API 명세서 v2.0 기준)
const ROUTES = {
  main: '/main',
  archive: '/archive',
  diaryList: '/diaries',
  diaryWrite: '/diaries/new',
  timeCapsules: '/time-capsules',
  interviews: '/interviews',
  profile: '/profile',
} as const;

const API_BASE_URL = 'http://localhost:4000/api';
const DRAFT_STORAGE_KEY = 'medelivery_diary_draft';
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// API 명세서 v2.0 기준 타입 정의 (MEM-01, MEM-02)
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

interface DiaryWritePageProps {
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

// 백엔드 미실행 시에도 달력 점 표시와 최근 기록을 확인할 수 있는 기본 데이터
const INITIAL_DIARIES: DiaryItem[] = [
  {
    diary_id: 3,
    user_id: 1,
    title: '겨울 끝의 포근한 저녁',
    content:
      '오늘은 유난히 노을이 오래 머물렀다. 집으로 돌아오는 길, 붉게 물든 하늘을 한참 올려다보았다.',
    created_at: '2026-11-18T20:24:00.000Z',
  },
  {
    diary_id: 2,
    user_id: 1,
    title: '엄마와 걷던 길',
    content: '오랜만에 천천히 동네를 걸었다. 사소한 대화들이 오래도록 마음에 남는다.',
    created_at: '2026-11-15T15:10:00.000Z',
  },
  {
    diary_id: 1,
    user_id: 1,
    title: '오랜만에 만난 우리',
    content: '못다 한 이야기를 한참 나눴다. 웃음이 끊이지 않던 고마운 오후.',
    created_at: '2026-11-10T14:20:00.000Z',
  },
];

function toDateKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatKoreanFullDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = date.getMonth() + 1;
  const dd = date.getDate();
  const dayName = WEEKDAYS[date.getDay()];
  return `${yyyy}년 ${mm}월 ${dd}일 ${dayName}요일`;
}

function formatRecentDateLabel(dateString: string, todayKey: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  if (toDateKey(date) === todayKey) {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? '오후' : '오전';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `오늘, ${period} ${hour12}:${minutes}`;
  }

  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export default function DiaryWritePage({ onLogout, onNavigate }: DiaryWritePageProps) {
  const [user, setUser] = useState<UserProfile>({
    user_id: 1,
    account_id: 'fin_user',
    username: 'FIN',
  });
  const [diaries, setDiaries] = useState<DiaryItem[]>(INITIAL_DIARIES);

  // 오늘 날짜 상태 (자정이 지나 하루가 바뀌면 자동으로 날짜 갱신)
  const [today, setToday] = useState<Date>(() => new Date());
  const [viewDate, setViewDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  // 에디터 입력 상태
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isDraftSaved, setIsDraftSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 최근 기록 클릭 시 상세 미리보기 모달
  const [previewDiary, setPreviewDiary] = useState<DiaryItem | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 1. 하루가 지날 때마다 달력의 오늘 날짜와 선택 날짜를 자동으로 갱신
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setToday((prevToday) => {
        if (toDateKey(prevToday) !== toDateKey(now)) {
          setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
          setSelectedDate(now);
          return now;
        }
        return prevToday;
      });
    }, 30 * 1000); // 30초 간격으로 날짜 변경 감지

    return () => clearInterval(timer);
  }, []);

  // 2. 사용자 정보, 임시 저장 초안, 기존 일기 목록 불러오기 (MEM-02: GET /api/diaries)
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser((prev) => ({ ...prev, ...parsed }));
      } catch {
        // 기본값 유지
      }
    }

    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDraft) {
      try {
        const parsedDraft = JSON.parse(savedDraft);
        if (parsedDraft.title) setTitle(parsedDraft.title);
        if (parsedDraft.content) setContent(parsedDraft.content);
        if (parsedDraft.title || parsedDraft.content) setIsDraftSaved(true);
      } catch {
        // 초안 파싱 실패 시 무시
      }
    }

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const fetchDiaries = async () => {
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
        // 백엔드 미실행 시 기본 샘플 데이터 유지
      }
    };

    fetchDiaries();
  }, []);

  // 3. 입력 내용 자동 임시 저장 (상단 우측 '임시 저장됨' 표시 연동)
  useEffect(() => {
    if (!title.trim() && !content.trim()) {
      setIsDraftSaved(false);
      return;
    }

    const timeout = setTimeout(() => {
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ title, content, updatedAt: new Date().toISOString() })
      );
      setIsDraftSaved(true);
    }, 600);

    return () => clearTimeout(timeout);
  }, [title, content]);

  // 일기를 작성한 날짜 목록 (달력 날짜 아래 작은 동그라미 표시용)
  const writtenDateSet = useMemo(() => {
    const set = new Set<string>();
    diaries.forEach((diary) => {
      const parsed = new Date(diary.created_at);
      if (!Number.isNaN(parsed.getTime())) {
        set.add(toDateKey(parsed));
      }
    });
    return set;
  }, [diaries]);

  // 최신순으로 정렬된 최근 기록 리스트
  const recentDiaries = useMemo(() => {
    return [...diaries].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [diaries]);

  // 현재 달력 월의 날짜 배열 계산
  const calendarCells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    const cells: Array<Date | null> = [];
    for (let i = 0; i < firstDay; i += 1) cells.push(null);
    for (let d = 1; d <= lastDate; d += 1) cells.push(new Date(year, month, d));
    return cells;
  }, [viewDate]);

  // 페이지 이동 처리
  const goToRoute = (path: string, label?: string) => {
    window.history.pushState({}, '', path);
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    if (label) {
      alert(`'${label}' 화면으로 이동합니다. (임시 주소: ${path})`);
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

  // 에디터 서식 툴바 텍스트 삽입
  const insertFormatting = (prefix: string, suffix = '') => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end);
    const nextValue =
      content.slice(0, start) + prefix + (selected || '내용') + suffix + content.slice(end);

    setContent(nextValue);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + (selected || '내용').length);
    });
  };

  // 이미지 파일 유효성 검사 및 미리보기 처리 (최대 10MB)
  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(JPG, PNG, WEBP 등)만 첨부할 수 있습니다.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      alert('최대 10MB 이하의 사진만 첨부할 수 있습니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewImage(reader.result);
        setImageFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  // 일기 저장 (MEM-01: POST /api/diaries)
  const handleSaveDiary = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      alert('일기 제목과 본문을 모두 입력해 주세요.');
      return;
    }

    setIsSaving(true);
    const token = localStorage.getItem('accessToken');

    try {
      if (token) {
        const response = await fetch(`${API_BASE_URL}/diaries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: title.trim(),
            content: content.trim(),
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            setDiaries((prev) => [result.data, ...prev]);
            localStorage.removeItem(DRAFT_STORAGE_KEY);
            alert('일기가 저장되었습니다.');
            goToRoute(ROUTES.diaryList, '일기장 전체보기');
            return;
          }
        }
      }
    } catch {
      // 백엔드 서버가 꺼져 있을 때 로컬 상태 반영 후 이동
    } finally {
      setIsSaving(false);
    }

    // 프론트엔드 단독 실행 시 즉시 달력 점·최근 기록 반영 후 전체보기로 이동
    const newDiary: DiaryItem = {
      diary_id: Date.now(),
      user_id: user.user_id,
      title: title.trim(),
      content: content.trim(),
      created_at: selectedDate.toISOString(),
    };
    setDiaries((prev) => [newDiary, ...prev]);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    alert(`"${newDiary.title}" 일기가 저장되었습니다.`);
    goToRoute(ROUTES.diaryList, '일기장 전체보기');
  };

  const todayKey = toDateKey(today);
  const selectedKey = toDateKey(selectedDate);

  return (
    <div className="min-h-screen w-full bg-[#FAF6F0] text-[#2C221A] flex flex-col font-['Noto_Sans_KR',sans-serif]">
      {/* 1. 상단 고정 헤더 */}
      <header className="sticky top-0 z-30 w-full bg-[#FAF6F0]/95 backdrop-blur-sm border-b border-[#E8E1D9]">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
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

          {/* 중앙 네비게이션 메뉴 */}
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
              href={ROUTES.diaryList}
              onClick={(e) => handleHeaderLink(e, ROUTES.diaryList, '일기장 전체보기')}
              className="flex items-center gap-1.5 text-[#2C221A] font-semibold border-b-2 border-[#9B7348] py-5"
            >
              <svg className="w-3.5 h-3.5 text-[#9B7348]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              일기
            </a>

            <a
              href={ROUTES.timeCapsules}
              onClick={(e) => handleHeaderLink(e, ROUTES.timeCapsules, '타임캡슐')}
              className="flex items-center gap-1.5 text-[#7D6E60] hover:text-[#2C221A] transition-colors py-5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                handleHeaderLink(e, ROUTES.profile, `${user.username}님 프로필 및 데드맨 스위치 설정`)
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

      {/* 2. 전체 크기 좌우 2단 분할 레이아웃 */}
      <div className="flex-1 w-full max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[310px_1fr]">
        {/* 왼쪽 사이드바: 달력 + 최근 기록 */}
        <aside className="px-5 sm:px-7 py-8 lg:border-r border-[#EAE2D6] bg-[#F6EFE6]/55 flex flex-col gap-7">
          {/* 상단 타이틀 */}
          <div>
            <p className="text-[10px] font-bold tracking-[0.14em] text-[#9B7348] uppercase mb-1">
              MY DIARY
            </p>
            <h2 className="font-['Noto_Serif_KR',serif] text-[22px] font-semibold text-[#2C221A] mb-1">
              하루의 조각들
            </h2>
            <p className="text-xs text-[#8C7A68]">작은 순간들을 천천히 모아보세요.</p>
          </div>

          {/* 달력 카드 (날짜 자동 갱신 + 일기 작성일 아래 작은 동그라미 표시) */}
          <div className="bg-white border border-[#E8E1D9] rounded-2xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-3.5 px-1">
              <button
                type="button"
                aria-label="이전 달"
                onClick={() =>
                  setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
                }
                className="w-7 h-7 rounded-lg hover:bg-[#FAF6F0] text-[#7D6E60] flex items-center justify-center text-sm cursor-pointer"
              >
                ‹
              </button>
              <span className="font-['Noto_Serif_KR',serif] text-[13px] font-bold text-[#2C221A]">
                {viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월
              </span>
              <button
                type="button"
                aria-label="다음 달"
                onClick={() =>
                  setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
                }
                className="w-7 h-7 rounded-lg hover:bg-[#FAF6F0] text-[#7D6E60] flex items-center justify-center text-sm cursor-pointer"
              >
                ›
              </button>
            </div>

            {/* 요일 행 */}
            <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-[#9E9286] mb-1.5">
              {WEEKDAYS.map((day) => (
                <span key={day} className="py-1">
                  {day}
                </span>
              ))}
            </div>

            {/* 날짜 셀 */}
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {calendarCells.map((dateObj, idx) => {
                if (!dateObj) {
                  return <span key={`empty-${idx}`} className="h-9" />;
                }

                const cellKey = toDateKey(dateObj);
                const isSelected = cellKey === selectedKey;
                const isToday = cellKey === todayKey;
                const hasWrittenDiary = writtenDateSet.has(cellKey);

                return (
                  <button
                    key={cellKey}
                    type="button"
                    onClick={() => setSelectedDate(dateObj)}
                    title={
                      hasWrittenDiary
                        ? `${formatKoreanFullDate(dateObj)} (일기 작성됨)`
                        : formatKoreanFullDate(dateObj)
                    }
                    className={`relative h-9 w-9 mx-auto rounded-full flex flex-col items-center justify-center text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#9B7348] text-white font-semibold shadow-2xs'
                        : isToday
                        ? 'bg-[#F3ECE2] text-[#2C221A] font-bold'
                        : 'text-[#3E2D1E] hover:bg-[#FAF6F0]'
                    }`}
                  >
                    <span className="leading-none">{dateObj.getDate()}</span>

                    {/* 일기를 작성한 날에는 날짜 아래에 작은 동그라미 표시 */}
                    {hasWrittenDiary && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-1 ${
                          isSelected ? 'bg-white' : 'bg-[#C88A55]'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 최근 기록 (여태까지 작성한 일기 제목 목록) */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-[#2C221A]">
                최근 기록 <span className="text-[#9B7348] font-semibold">({recentDiaries.length})</span>
              </h3>
              <a
                href={ROUTES.diaryList}
                onClick={(e) => handleHeaderLink(e, ROUTES.diaryList, '일기장 전체보기')}
                className="text-[11px] font-semibold text-[#9B7348] hover:underline"
              >
                전체보기
              </a>
            </div>

            {recentDiaries.length === 0 ? (
              <p className="text-xs text-[#9E9286] py-4">
                아직 작성된 일기가 없습니다.
              </p>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {recentDiaries.map((item, idx) => (
                  <button
                    key={item.diary_id}
                    type="button"
                    onClick={() => setPreviewDiary(item)}
                    className={`w-full text-left rounded-xl p-3 transition-colors cursor-pointer border ${
                      idx === 0
                        ? 'bg-[#EFE7DC] border-[#E2D5C3]'
                        : 'bg-white/70 hover:bg-white border-transparent hover:border-[#E8E1D9]'
                    }`}
                  >
                    <p className="text-[10px] font-medium text-[#9B7348] mb-0.5">
                      {formatRecentDateLabel(item.created_at, todayKey)}
                    </p>
                    <p className="font-['Noto_Serif_KR',serif] text-[13px] font-semibold text-[#2C221A] truncate">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-[#7D6E60] truncate mt-0.5">
                      {item.content}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* 오른쪽 메인 에디터: 일기 작성 및 사진 첨부 */}
        <main className="px-5 sm:px-10 py-8 sm:py-10 flex flex-col justify-between">
          <div>
            {/* 상단 타이틀 및 임시 저장 상태 */}
            <div className="flex items-end justify-between gap-4 mb-6">
              <div>
                <p className="text-[10px] font-bold tracking-[0.14em] text-[#9B7348] uppercase mb-1">
                  TODAY&apos;S STORY
                </p>
                <h1 className="font-['Noto_Serif_KR',serif] text-2xl sm:text-[28px] font-semibold text-[#2C221A]">
                  오늘의 이야기를 들려주세요
                </h1>
              </div>

              {isDraftSaved && (
                <span className="text-[11px] font-medium text-[#8C7A68] flex items-center gap-1 pb-1">
                  <svg className="w-3.5 h-3.5 text-[#9B7348]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  임시 저장됨
                </span>
              )}
            </div>

            {/* 일기 작성 흰색 카드 */}
            <form id="diary-write-form" onSubmit={handleSaveDiary}>
              <div className="bg-white border border-[#E8E1D9] rounded-3xl p-6 sm:p-10 shadow-2xs">
                {/* 선택된 날짜 표시 */}
                <div className="flex items-center gap-2 text-xs text-[#8C7A68] mb-5">
                  <svg className="w-3.5 h-3.5 text-[#9B7348]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>{formatKoreanFullDate(selectedDate)}</span>
                </div>

                {/* 일기 제목 입력 */}
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="겨울 끝의 포근한 저녁"
                  className="w-full font-['Noto_Serif_KR',serif] text-2xl sm:text-[26px] font-semibold text-[#2C221A] placeholder:text-[#C5B9AC] focus:outline-none"
                />

                {/* 에디터 서식 툴바 */}
                <div className="flex items-center gap-4 py-3 my-4 border-y border-[#F2ECE3] text-xs text-[#6E5D4F]">
                  <button
                    type="button"
                    onClick={() => insertFormatting('**', '**')}
                    className="font-bold hover:text-[#2C221A] px-1 cursor-pointer"
                    title="굵게"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('*', '*')}
                    className="italic font-serif hover:text-[#2C221A] px-1 cursor-pointer"
                    title="기울임"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('__', '__')}
                    className="underline hover:text-[#2C221A] px-1 cursor-pointer"
                    title="밑줄"
                  >
                    U
                  </button>
                  <span className="h-3.5 w-px bg-[#E8E1D9]" />
                  <button
                    type="button"
                    onClick={() => insertFormatting('\n> ', '')}
                    className="hover:text-[#2C221A] px-1 cursor-pointer"
                    title="인용구"
                  >
                    “ ”
                  </button>
                  <label
                    className="hover:text-[#2C221A] px-1 cursor-pointer flex items-center"
                    title="사진 첨부"
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </label>
                </div>

                {/* 일기 본문 입력창 */}
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="오늘 하루는 어떤 순간들로 채워졌나요? 편하게 이야기를 들려주세요..."
                  rows={9}
                  className="w-full text-sm sm:text-[15px] text-[#3E2D1E] placeholder:text-[#B5AAA0] leading-8 resize-none focus:outline-none mb-6"
                />

                {/* 사진 첨부 드롭존 (클릭 및 드래그 앤 드롭 지원) */}
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`block w-full rounded-2xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
                    isDragging
                      ? 'border-[#9B7348] bg-[#F3ECE2]'
                      : 'border-[#DFD3C3] bg-[#FAF6F0]/60 hover:bg-[#FAF6F0]'
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />

                  {previewImage ? (
                    <div className="space-y-3">
                      <img
                        src={previewImage}
                        alt="첨부된 일기 사진 미리보기"
                        className="max-h-60 mx-auto rounded-xl object-cover shadow-xs"
                      />
                      <div className="flex items-center justify-center gap-3 text-xs">
                        <span className="text-[#6E5D4F] truncate max-w-[220px]">
                          {imageFileName}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setPreviewImage(null);
                            setImageFileName('');
                          }}
                          className="text-red-600 font-semibold hover:underline cursor-pointer"
                        >
                          사진 삭제
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-3 flex flex-col items-center justify-center">
                      <svg
                        className="w-6 h-6 text-[#9B7348] mb-2"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <p className="text-xs font-semibold text-[#5C4632]">
                        오늘의 사진을 더해보세요
                      </p>
                      <p className="text-[11px] text-[#9E9286] mt-1">
                        클릭하거나 파일을 이곳에 끌어놓으세요 · 최대 10MB
                      </p>
                    </div>
                  )}
                </label>
              </div>
            </form>
          </div>

          {/* 하단 글자 수 카운트 및 일기 저장 버튼 */}
          <div className="flex items-center justify-end gap-4 mt-5">
            <span className="text-xs text-[#9E9286]">
              공백 포함 {content.length}자
            </span>

            <button
              type="submit"
              form="diary-write-form"
              disabled={isSaving}
              className="h-11 px-6 rounded-xl bg-[#9B7348] hover:bg-[#87623B] disabled:opacity-60 text-white text-xs sm:text-[13px] font-semibold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {isSaving ? '저장 중...' : '일기 저장'}
            </button>
          </div>
        </main>
      </div>

      {/* 왼쪽 '최근 기록' 제목 클릭 시 열리는 간편 열람 모달 */}
      {previewDiary && (
        <div
          onClick={() => setPreviewDiary(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[520px] bg-[#FAF6F0] border border-[#E8E1D9] rounded-3xl p-7 shadow-xl"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[#9B7348]">
                {formatKoreanFullDate(new Date(previewDiary.created_at))}
              </span>
              <button
                type="button"
                onClick={() => setPreviewDiary(null)}
                className="text-[#8C7A68] hover:text-[#2C221A] text-base cursor-pointer"
              >
                ✕
              </button>
            </div>
            <h3 className="font-['Noto_Serif_KR',serif] text-xl font-bold text-[#2C221A] pb-3 mb-4 border-b border-[#E8E1D9]">
              {previewDiary.title}
            </h3>
            <p className="text-sm text-[#3E2D1E] leading-7 whitespace-pre-wrap mb-6">
              {previewDiary.content}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreviewDiary(null);
                  goToRoute(ROUTES.diaryList, '일기장 전체보기');
                }}
                className="h-9 px-4 rounded-xl bg-white border border-[#E8E1D9] text-xs font-semibold text-[#5C4632] cursor-pointer"
              >
                일기장 전체보기
              </button>
              <button
                type="button"
                onClick={() => setPreviewDiary(null)}
                className="h-9 px-5 rounded-xl bg-[#9B7348] text-white text-xs font-semibold cursor-pointer"
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