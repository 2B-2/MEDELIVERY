import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

// 페이지 이동 경로 (API 명세서 v2.0 기준)
const ROUTES = {
  main: '/main',
  archive: '/archive',
  diaries: '/diaries',
  timeCapsules: '/time-capsules',
  interviews: '/interviews',
  profile: '/profile',
  recipientArchive: '/recipient-archive',
} as const;

const IMPLEMENTED_ROUTES: string[] = [
  ROUTES.main,
  ROUTES.archive,
  ROUTES.diaries,
  ROUTES.timeCapsules,
  ROUTES.interviews,
  ROUTES.profile,
  ROUTES.recipientArchive,
];

const API_BASE_URL = 'http://3.26.210.69:4000/api';

// 수신자 보안 열람용 정해진 6자리 초대 코드
const VALID_INVITE_CODE = '123456';

type RecordCategory = 'all' | 'diary' | 'capsule' | 'autobiography';

interface UserProfile {
  user_id: number;
  account_id: string;
  username: string;
}

interface DiaryApiItem {
  diary_id: number;
  title: string;
  content: string;
  created_at: string;
}

interface TimeCapsuleApiItem {
  capsule_id: number;
  title: string;
  message?: string;
  open_date: string;
  is_opened?: boolean;
}

interface InterviewApiItem {
  interview_id: number;
  chapter_name: string;
  created_at?: string;
}

interface InterviewQuestionApiItem {
  question_id: number;
  interview_id: number;
  question_answer: string;
}

interface LastDiaryView {
  title: string;
  dateText: string;
  paragraphs: string[];
}

interface SharedRecordItem {
  id: string;
  category: Exclude<RecordCategory, 'all'>;
  categoryLabel: '일기' | '타임캡슐' | '자서전';
  title: string;
  subtitle: string;
  content: string;
  dateText: string;
  metaText: string;
  actionLabel: string;
  timestamp: number;
}

interface RecipientArchivePageProps {
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

function formatDotDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}. ${mm}. ${dd}.`;
}

export default function RecipientArchivePage({
  onLogout,
  onNavigate,
}: RecipientArchivePageProps) {
  const [user, setUser] = useState<UserProfile | null>(null);

  // 보안 초대 코드 인증 상태
  const [isCodeVerified, setIsCodeVerified] = useState<boolean>(false);
  const [codeDigits, setCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isCodeErrorModalOpen, setIsCodeErrorModalOpen] = useState<boolean>(false);
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // 중간 카드: 마지막으로 작성한 일기
  const [lastDiary, setLastDiary] = useState<LastDiaryView | null>(null);
  const [isLastDiaryModalOpen, setIsLastDiaryModalOpen] = useState(false);

  // 당신에게 남긴 기록 리스트 및 카테고리 탭 상태
  const [records, setRecords] = useState<SharedRecordItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<RecordCategory>('all');
  const [selectedRecord, setSelectedRecord] = useState<SharedRecordItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string>('');

  // 진입 시 첫 번째 초대 코드 입력 칸에 자동 포커스
  useEffect(() => {
    if (!isCodeVerified) {
      const timer = setTimeout(() => {
        codeInputRefs.current[0]?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isCodeVerified]);

  // 로그인 사용자 정보 로드
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        // 파싱 실패 시 무시
      }
    }
  }, []);

  // 보안 초대 코드 인증 완료 후 백엔드 실제 데이터(일기, 타임캡슐, 자서전) 조회
  useEffect(() => {
    if (!isCodeVerified) return;

    const token = localStorage.getItem('accessToken');
    if (!token) {
      if (onLogout) onLogout();
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const fetchAllSharedRecords = async () => {
      setIsLoading(true);
      setFetchError('');
      try {
        const [diariesRes, capsulesRes, interviewsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/diaries`, { headers }),
          fetch(`${API_BASE_URL}/time-capsules`, { headers }),
          fetch(`${API_BASE_URL}/interviews`, { headers }),
        ]);

        if (
          diariesRes.status === 401 ||
          capsulesRes.status === 401 ||
          interviewsRes.status === 401
        ) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('user');
          if (onLogout) onLogout();
          return;
        }

        const [diariesJson, capsulesJson, interviewsJson] = await Promise.all([
          diariesRes.json().catch(() => ({ success: false, data: [] })),
          capsulesRes.json().catch(() => ({ success: false, data: [] })),
          interviewsRes.json().catch(() => ({ success: false, data: [] })),
        ]);

        const combined: SharedRecordItem[] = [];

        // 1. 일기 목록 처리
        const diaries: DiaryApiItem[] =
          diariesJson.success && Array.isArray(diariesJson.data) ? diariesJson.data : [];

        if (diaries.length > 0) {
          const sortedDiaries = [...diaries].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          const latest = sortedDiaries[0];
          setLastDiary({
            title: latest.title,
            dateText: formatDotDate(latest.created_at),
            paragraphs: (latest.content || '')
              .split(/\n+/)
              .map((line) => line.trim())
              .filter(Boolean),
          });

          sortedDiaries.forEach((d) => {
            const plain = (d.content || '').replace(/\s+/g, ' ').trim();
            combined.push({
              id: `diary-${d.diary_id}`,
              category: 'diary',
              categoryLabel: '일기',
              title: d.title,
              subtitle: plain.slice(0, 40) || '기록된 일기',
              content: d.content || '',
              dateText: formatDotDate(d.created_at),
              metaText: '일기 기록',
              actionLabel: '일기 읽기',
              timestamp: new Date(d.created_at).getTime() || 0,
            });
          });
        } else {
          setLastDiary(null);
        }

        // 2. 타임캡슐 목록 처리
        const capsules: TimeCapsuleApiItem[] =
          capsulesJson.success && Array.isArray(capsulesJson.data) ? capsulesJson.data : [];

        const nowMs = Date.now();
        capsules.forEach((cap) => {
          const openMs = new Date(cap.open_date).getTime();
          const isUnlocked = Boolean(cap.is_opened) || (!Number.isNaN(openMs) && openMs <= nowMs);
          const formattedOpen = formatDotDate(cap.open_date);

          combined.push({
            id: `capsule-${cap.capsule_id}`,
            category: 'capsule',
            categoryLabel: '타임캡슐',
            title: cap.title,
            subtitle: isUnlocked ? '봉인이 해제된 편지' : `${formattedOpen} 개봉 예정`,
            content: isUnlocked
              ? cap.message || '전달된 타임캡슐 메시지입니다.'
              : `이 타임캡슐은 ${formattedOpen}에 봉인이 해제됩니다.`,
            dateText: formattedOpen,
            metaText: isUnlocked ? '봉인 해제 완료' : '봉인 중',
            actionLabel: '타임캡슐 읽기',
            timestamp: openMs || 0,
          });
        });

        // 3. 자서전 단원 목록 및 각 단원 상세(interviewQs) 조회
        const interviews: InterviewApiItem[] =
          interviewsJson.success && Array.isArray(interviewsJson.data)
            ? interviewsJson.data
            : [];

        if (interviews.length > 0) {
          const detailResults = await Promise.all(
            interviews.map(async (iv) => {
              try {
                const detailRes = await fetch(
                  `${API_BASE_URL}/interviews/${iv.interview_id}`,
                  { headers }
                );
                if (!detailRes.ok) return { iv, questions: [] as InterviewQuestionApiItem[] };
                const detailJson = await detailRes.json();
                const questions: InterviewQuestionApiItem[] =
                  detailJson.success && Array.isArray(detailJson.data?.questions)
                    ? detailJson.data.questions
                    : [];
                return { iv, questions };
              } catch {
                return { iv, questions: [] as InterviewQuestionApiItem[] };
              }
            })
          );

          detailResults.forEach(({ iv, questions }) => {
            const fullBody = questions
              .map((q) => q.question_answer)
              .filter(Boolean)
              .join('\n\n');

            combined.push({
              id: `auto-${iv.interview_id}`,
              category: 'autobiography',
              categoryLabel: '자서전',
              title: iv.chapter_name,
              subtitle:
                fullBody.replace(/\s+/g, ' ').trim().slice(0, 40) || '자서전 단원 기록',
              content: fullBody || '작성된 자서전 본문이 없습니다.',
              dateText: formatDotDate(iv.created_at),
              metaText: `자서전 · ${questions.length}개 이야기`,
              actionLabel: '자서전 읽기',
              timestamp: iv.created_at ? new Date(iv.created_at).getTime() : 0,
            });
          });
        }

        combined.sort((a, b) => b.timestamp - a.timestamp);
        setRecords(combined);
      } catch {
        setFetchError(
          '서버(http://3.26.210.69:4000)에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllSharedRecords();
  }, [isCodeVerified, onLogout]);

  const displayName = user?.username || user?.account_id || '사용자';

  // 6자리 보안 초대 코드 입력 핸들러
  const handleCodeDigitChange = (index: number, rawValue: string) => {
    const cleaned = rawValue.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const char = cleaned.slice(-1);

    setCodeDigits((prev) => {
      const next = [...prev];
      next[index] = char;
      return next;
    });

    if (char && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6);

    if (!pasted) return;

    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i += 1) {
      next[i] = pasted[i];
    }
    setCodeDigits(next);

    const focusIdx = Math.min(pasted.length, 5);
    codeInputRefs.current[focusIdx]?.focus();
  };

  // '기록 열람하기' 제출 검증
  const handleVerifyInviteCode = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const enteredCode = codeDigits.join('');

    if (enteredCode === VALID_INVITE_CODE) {
      setIsCodeVerified(true);
      setIsCodeErrorModalOpen(false);
    } else {
      setIsCodeErrorModalOpen(true);
    }
  };

  const handleCloseErrorModal = () => {
    setIsCodeErrorModalOpen(false);
    setCodeDigits(['', '', '', '', '', '']);
    setTimeout(() => {
      codeInputRefs.current[0]?.focus();
    }, 50);
  };

  // 탭별 개수 계산
  const categoryCounts = useMemo(() => {
    return {
      all: records.length,
      diary: records.filter((r) => r.category === 'diary').length,
      capsule: records.filter((r) => r.category === 'capsule').length,
      autobiography: records.filter((r) => r.category === 'autobiography').length,
    };
  }, [records]);

  // 선택된 탭에 해당하는 기록만 필터링
  const filteredRecords = useMemo(() => {
    if (activeCategory === 'all') return records;
    return records.filter((item) => item.category === activeCategory);
  }, [records, activeCategory]);

  // 헤더 이동 핸들러
  const handleHeaderLink = (
    e: MouseEvent<HTMLAnchorElement>,
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

  // 전체 기록 PDF 저장
  const handleDownloadFullPdf = () => {
    window.print();
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF6F0] text-[#2C221A] font-['Noto_Sans_KR',sans-serif]">
      {/* PDF 저장 전용 인쇄 스타일 */}
      <style>{`
        @media print {
          header, .no-print { display: none !important; }
          .print-only-full-archive { display: block !important; }
          body, .min-h-screen { background: #ffffff !important; }
          main { max-width: 100% !important; padding: 0 !important; }
        }
      `}</style>

      {/* 보안 코드 인증 전에는 배경 콘텐츠를 블러 처리하여 열람 차단 */}
      <div
        aria-hidden={!isCodeVerified}
        className={
          !isCodeVerified
            ? 'blur-md pointer-events-none select-none transition-all duration-300'
            : 'transition-all duration-300'
        }
      >
        {/* 1. 상단 고정 헤더 */}
        <header className="sticky top-0 z-30 w-full bg-[#FAF6F0]/95 backdrop-blur-sm border-b border-[#E8E1D9]">
          <div className="max-w-[1040px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
            <a
              href={ROUTES.main}
              onClick={(e) => handleHeaderLink(e, ROUTES.main, '메인 아카이브')}
              className="flex items-center gap-2.5"
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

            <nav className="hidden md:flex items-center gap-7 text-[13px] font-medium">
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
                onClick={(e) => handleHeaderLink(e, ROUTES.diaries, '일기')}
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

            <div className="flex items-center gap-2.5">
              <a
                href={ROUTES.profile}
                onClick={(e) => handleHeaderLink(e, ROUTES.profile, `${displayName}님 프로필`)}
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
        <main className="max-w-[980px] mx-auto px-5 sm:px-8 py-7 sm:py-10">
          <div className="flex items-center justify-between text-[11px] text-[#9E9286] mb-4">
            <span className="font-bold tracking-[0.14em] uppercase">PRIVATE ARCHIVE</span>
            <span>데드맨 스위치 · 타임캡슐</span>
          </div>

          {/* 2. 상단 히어로 배너 */}
          <section
            className="w-full rounded-3xl border border-[#E8DEC8] px-7 sm:px-11 py-10 sm:py-12 mb-7 shadow-2xs"
            style={{
              background: 'linear-gradient(135deg, #F5EFE6 0%, #EFE5D6 100%)',
            }}
          >
            <p className="text-[10px] font-bold tracking-[0.16em] text-[#9B7348] uppercase mb-2.5">
              A LETTER ACROSS TIME
            </p>
            <h1 className="font-['Noto_Serif_KR',serif] text-2xl sm:text-[32px] font-semibold text-[#2C221A] tracking-tight mb-2">
              소중한 기록이 전달되었습니다
            </h1>
            <p className="text-xs sm:text-sm text-[#7D6E60]">
              당신에게 전하고 싶었던 마음을, 편안한 속도로 천천히 읽어보세요.
            </p>
          </section>

          {fetchError && (
            <div className="mb-6 p-4 rounded-2xl bg-[#FCEEEA] border border-[#F3D1C8] text-xs text-[#A84A3A] font-medium no-print">
              {fetchError}
            </div>
          )}

          {isLoading ? (
            <div className="w-full py-24 text-center text-xs text-[#8C7A68]">
              전달된 기록을 불러오는 중입니다...
            </div>
          ) : (
            <>
              {/* 3. 중간 카드: 마지막으로 작성한 일기 */}
              {lastDiary && (
                <section className="bg-white border border-[#E8E1D9] rounded-3xl p-6 sm:p-10 shadow-2xs mb-11">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-[#F3EDE5]">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#9B7348]">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                        마지막으로 작성한 일기
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#F4EFE8] text-[10px] font-semibold text-[#8C7A68]">
                        최종 기록
                      </span>
                    </div>

                    <span className="text-[11px] text-[#9E9286]">
                      작성일 {lastDiary.dateText}
                    </span>
                  </div>

                  <h2 className="font-['Noto_Serif_KR',serif] text-xl sm:text-[24px] font-semibold text-[#2C221A] mb-5">
                    {lastDiary.title}
                  </h2>

                  <div className="space-y-3.5 text-xs sm:text-[14px] text-[#4A3B2E] leading-7 mb-7">
                    {lastDiary.paragraphs.map((line, index) => (
                      <p key={index}>{line}</p>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-[#F3EDE5] flex items-center justify-between text-xs no-print">
                    <span className="text-[#9E9286]">마지막으로 남긴 일기 전문입니다.</span>
                    <button
                      type="button"
                      onClick={() => setIsLastDiaryModalOpen(true)}
                      className="font-semibold text-[#9B7348] hover:text-[#7A5734] transition-colors cursor-pointer"
                    >
                      일기 전문 보기 →
                    </button>
                  </div>
                </section>
              )}

              {/* 4. 당신에게 남긴 기록 (전체 / 일기 / 타임캡슐 / 자서전 필터 탭) */}
              <section className="mb-10">
                <div className="flex items-end justify-between mb-4">
                  <h2 className="font-['Noto_Serif_KR',serif] text-xl sm:text-2xl font-semibold text-[#2C221A]">
                    당신에게 남긴 기록
                  </h2>
                  <span className="text-xs text-[#9E9286]">
                    총 {filteredRecords.length}개의 기록
                  </span>
                </div>

                <div className="flex items-center gap-6 border-b border-[#E8E1D9] mb-6 text-xs sm:text-[13px] no-print">
                  {[
                    { key: 'all' as const, label: '전체', count: categoryCounts.all },
                    { key: 'diary' as const, label: '일기', count: categoryCounts.diary },
                    { key: 'capsule' as const, label: '타임캡슐', count: categoryCounts.capsule },
                    {
                      key: 'autobiography' as const,
                      label: '자서전',
                      count: categoryCounts.autobiography,
                    },
                  ].map((tab) => {
                    const isSelected = activeCategory === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveCategory(tab.key)}
                        className={`pb-3 transition-colors cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'font-bold text-[#2C221A] border-b-2 border-[#9B7348]'
                            : 'font-medium text-[#8C7A68] hover:text-[#2C221A]'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`text-[11px] ${
                            isSelected ? 'text-[#9B7348] font-bold' : 'text-[#B5AAA0]'
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {filteredRecords.length === 0 ? (
                  <div className="w-full py-16 text-center bg-white/70 border border-[#E8E1D9] rounded-2xl text-xs text-[#8C7A68]">
                    전달된 기록이 아직 없습니다.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredRecords.map((item) => (
                      <article
                        key={item.id}
                        onClick={() => setSelectedRecord(item)}
                        className="group bg-white hover:bg-[#FFFDF9] border border-[#E8E1D9] hover:border-[#C9B398] rounded-2xl overflow-hidden shadow-2xs hover:shadow-sm transition-all flex flex-col cursor-pointer"
                      >
                        {item.category === 'autobiography' && (
                          <div className="h-40 w-full bg-gradient-to-br from-[#8D5A36] to-[#6E4224] p-5 flex flex-col justify-between text-[#FAF6F0]">
                            <span className="text-[9px] font-bold tracking-[0.16em] text-[#E5C9A8] uppercase">
                              AUTOBIOGRAPHY
                            </span>
                            <p className="font-['Noto_Serif_KR',serif] text-lg font-semibold leading-snug line-clamp-2">
                              {item.title}
                            </p>
                          </div>
                        )}

                        {item.category === 'capsule' && (
                          <div className="h-40 w-full bg-[#EFE8DD] p-4 flex items-center justify-center">
                            <div className="w-full h-full rounded-xl border border-[#DFD3C3] bg-[#FAF6F0]/80 flex flex-col items-center justify-center text-center px-3">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#C98E5B] mb-2" />
                              <p className="font-['Noto_Serif_KR',serif] text-xs font-semibold text-[#5C4632]">
                                {item.dateText}
                              </p>
                              <span className="text-[9px] tracking-[0.16em] text-[#9E9286] uppercase mt-1">
                                A LETTER FOR YOU
                              </span>
                            </div>
                          </div>
                        )}

                        {item.category === 'diary' && (
                          <div className="relative h-40 w-full bg-gradient-to-br from-[#DFC7AE] via-[#CBB092] to-[#9E8468] overflow-hidden p-4 flex items-end">
                            <svg
                              viewBox="0 0 320 160"
                              className="absolute inset-0 w-full h-full opacity-40 group-hover:scale-105 transition-transform duration-500"
                              preserveAspectRatio="none"
                            >
                              <circle cx="245" cy="44" r="22" fill="#FFFDF9" opacity="0.7" />
                              <path
                                d="M0 112 Q95 88 180 110 T320 98 L320 160 L0 160 Z"
                                fill="#5C4632"
                                opacity="0.55"
                              />
                            </svg>
                            <span className="relative z-10 px-2.5 py-0.5 rounded-full bg-[#FAF6F0]/90 text-[#6E4E2E] text-[10px] font-bold">
                              DIARY ARCHIVE
                            </span>
                          </div>
                        )}

                        <div className="p-5 flex-1 flex flex-col justify-between">
                          <div>
                            <p className="text-[11px] font-semibold text-[#9B7348] mb-1">
                              {item.categoryLabel}
                            </p>
                            <h3 className="font-['Noto_Serif_KR',serif] text-base font-semibold text-[#2C221A] group-hover:text-[#9B7348] transition-colors line-clamp-1 mb-1">
                              {item.title}
                            </h3>
                            <p className="text-xs text-[#7D6E60] line-clamp-1 mb-2">
                              {item.subtitle}
                            </p>
                            <p className="text-[11px] text-[#A3978B]">
                              {item.dateText} · {item.metaText}
                            </p>
                          </div>

                          <div className="mt-4 pt-3 border-t border-[#F3EDE5] no-print">
                            <span className="text-xs font-semibold text-[#9B7348] group-hover:translate-x-0.5 inline-block transition-transform">
                              {item.actionLabel} →
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* 5. 맨 밑: 모든 기록 PDF 저장 배너 & 버튼 */}
          <section className="rounded-2xl bg-[#EFE7DC] border border-[#E3D6C5] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-5 no-print">
            <div>
              <h3 className="font-['Noto_Serif_KR',serif] text-lg sm:text-xl font-semibold text-[#2C221A] mb-1.5">
                오래 곁에 두고 읽을 수 있도록
              </h3>
              <p className="text-xs text-[#6E5D4F] leading-relaxed">
                마지막 일기 · 일기장 · 타임캡슐 · 자서전의 모든 기록을 한 권의 PDF로 보관합니다.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadFullPdf}
              className="self-start sm:self-auto h-11 px-6 rounded-xl bg-[#9B7348] hover:bg-[#87623B] text-white text-xs sm:text-[13px] font-semibold flex items-center gap-2 shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              PDF로 전체 기록 다운로드
            </button>
          </section>

          {/* 보안 열람 안내 문구 */}
          <div className="rounded-xl bg-white/80 border border-[#E8E1D9] px-5 py-4 text-xs text-[#6E5D4F] mb-8 no-print">
            <p className="font-bold text-[#3E2D1E] mb-0.5">
              🔒 본 페이지는 지정된 수신자만 열람할 수 있는 보안 영역입니다
            </p>
            <p className="text-[11px] text-[#8C7A68]">
              남겨진 마음과 개인정보를 위해 열람 주소와 내려받은 문서의 공유에 주의해 주세요.
            </p>
          </div>

          {/* PDF 저장 시 함께 출력되는 전체 기록 합본 영역 */}
          <section className="hidden print-only-full-archive mt-10 pt-8 border-t border-[#D6CCC2]">
            <h2 className="font-['Noto_Serif_KR',serif] text-xl font-bold mb-6">
              전달된 전체 기록 모음 ({records.length}편)
            </h2>
            <div className="space-y-8">
              {records.map((rec) => (
                <div key={`print-${rec.id}`} className="pb-6 border-b border-[#E8E1D9]">
                  <p className="text-xs text-[#8C7A68] mb-1">
                    [{rec.categoryLabel}] {rec.dateText} · {rec.metaText}
                  </p>
                  <h3 className="font-['Noto_Serif_KR',serif] text-lg font-bold mb-2">
                    {rec.title}
                  </h3>
                  <p className="text-sm leading-7 whitespace-pre-wrap">{rec.content}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 하단 푸터 */}
          <footer className="pt-4 border-t border-[#EAE2D6] flex items-center justify-between text-[11px] text-[#9E9286] no-print">
            <span>© MEDELIVERY</span>
            <span>디지털 유산 · 셀프 바인딩 및 타임캡슐 기반 생애설계 플랫폼</span>
          </footer>
        </main>
      </div>

      {/* [최초 진입 팝업] 보안 초대 코드 입력 모달 */}
      {!isCodeVerified && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs px-4">
          <div className="w-full max-w-[480px] bg-[#FFFDF8] border border-[#E8E1D9] rounded-2xl px-7 py-8 sm:px-9 sm:py-9 shadow-xl text-center">
            <div className="w-11 h-11 rounded-full bg-[#F2ECE3] text-[#9B7348] flex items-center justify-center mx-auto mb-5">
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="7.5" cy="15.5" r="4.5" />
                <path d="m21 2-9.6 9.6" />
                <path d="m15.5 7.5 3 3L22 7l-3-3" />
              </svg>
            </div>

            <h2 className="font-['Noto_Serif_KR',serif] text-xl sm:text-[22px] font-bold text-[#2C221A] mb-2.5">
              보안 초대 코드를 입력해 주세요
            </h2>
            <p className="text-xs text-[#8C7A68] leading-relaxed mb-7">
              전달받으신 6자리 보안 코드 또는 PIN 번호를 입력하시면
              <br />
              남겨진 기록을 확인하실 수 있습니다.
            </p>

            <form onSubmit={handleVerifyInviteCode}>
              <div className="flex items-center justify-center gap-2 sm:gap-2.5 mb-7">
                {codeDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      codeInputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    aria-label={`보안 초대 코드 ${idx + 1}번째 자리`}
                    value={digit}
                    onChange={(e) => handleCodeDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(idx, e)}
                    onPaste={handleCodePaste}
                    className="w-10 h-11 sm:w-12 sm:h-12 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] text-center text-base sm:text-lg font-bold text-[#2C221A] focus:outline-none focus:border-[#9B7348] focus:bg-white transition-colors"
                  />
                ))}
              </div>

              <button
                type="submit"
                className="w-full h-11 rounded-lg bg-[#8B6746] hover:bg-[#765639] text-white text-xs sm:text-[13px] font-semibold shadow-xs transition-colors cursor-pointer"
              >
                기록 열람하기
              </button>
            </form>

            <p className="text-[11px] text-[#9E9286] mt-5">
              코드를 전달받지 못하셨나요?{' '}
              <button
                type="button"
                onClick={() =>
                  alert(
                    `발송된 안내 문자 또는 이메일의 6자리 보안 코드를 확인해 주세요.\n(보안 코드: ${VALID_INVITE_CODE})`
                  )
                }
                className="text-[#8B6746] font-medium underline hover:text-[#2C221A] cursor-pointer"
              >
                (문의하기)
              </button>
            </p>
          </div>
        </div>
      )}

      {/* [오류 팝업] 정해진 코드와 일치하지 않을 때 '코드가 잘못되었습니다' 출력 */}
      {isCodeErrorModalOpen && (
        <div
          onClick={handleCloseErrorModal}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] bg-[#FFFDF8] border border-[#E8E1D9] rounded-2xl p-6 sm:p-7 text-center shadow-2xl"
          >
            <div className="w-11 h-11 rounded-full bg-[#FCEEEA] text-[#A84A3A] flex items-center justify-center mx-auto mb-3.5 text-base font-bold">
              !
            </div>

            <h3 className="font-['Noto_Serif_KR',serif] text-lg font-bold text-[#2C221A] mb-1.5">
              코드가 잘못되었습니다
            </h3>
            <p className="text-xs text-[#7D6E60] leading-relaxed mb-6">
              입력하신 보안 초대 코드가 일치하지 않습니다.
              <br />
              6자리 코드를 다시 확인해 주세요.
            </p>

            <button
              type="button"
              onClick={handleCloseErrorModal}
              className="w-full h-10 rounded-lg bg-[#8B6746] hover:bg-[#765639] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              다시 입력하기
            </button>
          </div>
        </div>
      )}

      {/* 마지막으로 작성한 일기 전문 보기 모달 */}
      {isLastDiaryModalOpen && lastDiary && (
        <div
          onClick={() => setIsLastDiaryModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] bg-[#FAF6F0] border border-[#E8E1D9] rounded-3xl p-7 sm:p-9 shadow-xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#9B7348]">
                마지막으로 작성한 일기 · {lastDiary.dateText}
              </span>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setIsLastDiaryModalOpen(false)}
                className="text-[#8C7A68] hover:text-[#2C221A] text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <h3 className="font-['Noto_Serif_KR',serif] text-2xl font-bold text-[#2C221A] pb-4 mb-5 border-b border-[#E8E1D9]">
              {lastDiary.title}
            </h3>

            <div className="space-y-4 text-sm text-[#3E2D1E] leading-8 mb-8">
              {lastDiary.paragraphs.map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-[#E8E1D9]">
              <button
                type="button"
                onClick={() => setIsLastDiaryModalOpen(false)}
                className="h-9.5 px-6 rounded-xl bg-[#9B7348] hover:bg-[#87623B] text-white text-xs font-semibold cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 개별 기록(일기 / 타임캡슐 / 자서전) 상세 읽기 모달 */}
      {selectedRecord && (
        <div
          onClick={() => setSelectedRecord(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] bg-[#FAF6F0] border border-[#E8E1D9] rounded-3xl p-7 sm:p-9 shadow-xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-1 rounded-full bg-[#EFE7DC] text-[#7A5734] text-[11px] font-semibold">
                {selectedRecord.categoryLabel} · {selectedRecord.dateText}
              </span>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setSelectedRecord(null)}
                className="text-[#8C7A68] hover:text-[#2C221A] text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <h3 className="font-['Noto_Serif_KR',serif] text-2xl font-bold text-[#2C221A] pb-4 mb-5 border-b border-[#E8E1D9]">
              {selectedRecord.title}
            </h3>

            <p className="text-sm text-[#3E2D1E] leading-8 whitespace-pre-wrap mb-8">
              {selectedRecord.content}
            </p>

            <div className="flex justify-end pt-4 border-t border-[#E8E1D9]">
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="h-9.5 px-6 rounded-xl bg-[#9B7348] hover:bg-[#87623B] text-white text-xs font-semibold cursor-pointer"
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