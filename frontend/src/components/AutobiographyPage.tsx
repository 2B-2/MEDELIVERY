import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';

// 페이지 이동 경로 (API 명세서 v2.0 기준)
const ROUTES = {
  main: '/main',
  archive: '/archive',
  diaries: '/diaries',
  timeCapsules: '/time-capsules',
  interviews: '/interviews',
  profile: '/profile',
} as const;

const IMPLEMENTED_ROUTES: string[] = [
  ROUTES.main,
  ROUTES.archive,
  ROUTES.diaries,
  ROUTES.timeCapsules,
  ROUTES.interviews,
  ROUTES.profile,
];

const API_BASE_URL = 'http://3.26.210.69:4000/api';

interface UserProfile {
  user_id: number;
  account_id: string;
  username: string;
}

// schema_2.sql: interviews & interviewQs
interface InterviewSummary {
  interview_id: number;
  user_id?: number;
  chapter_name: string;
  created_at?: string;
}

interface InterviewQuestionItem {
  question_id: number;
  interview_id: number;
  question_answer: string;
}

interface BookSpread {
  leftHeading: string;
  leftParagraphs: string[];
  leftQuote?: string;
  rightCaption?: string;
  rightCoverTone: string;
  rightParagraphs: string[];
}

interface EraChapterItem {
  era: '10대~20대' | '30대~40대' | '50대~60대' | '70대~80대';
  chapterNumber: string;
  interview_id: number | null;
  title: string;
  isCompleted: boolean;
  spreads: BookSpread[];
}

interface AutobiographyPageProps {
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

const ERA_CONFIG: Array<{
  era: '10대~20대' | '30대~40대' | '50대~60대' | '70대~80대';
  chapterNumber: string;
  coverTone: string;
}> = [
  {
    era: '10대~20대',
    chapterNumber: 'CHAPTER 01',
    coverTone: 'from-[#DFC49B] via-[#C9AE84] to-[#7D8C75]',
  },
  {
    era: '30대~40대',
    chapterNumber: 'CHAPTER 02',
    coverTone: 'from-[#D7BFA8] via-[#B89778] to-[#7B6148]',
  },
  {
    era: '50대~60대',
    chapterNumber: 'CHAPTER 03',
    coverTone: 'from-[#E4C6A3] via-[#C99E72] to-[#8C643E]',
  },
  {
    era: '70대~80대',
    chapterNumber: 'CHAPTER 04',
    coverTone: 'from-[#DFD3C3] via-[#C3B099] to-[#8B765E]',
  },
];

// interviewQs의 question_answer 텍스트 목록을 책의 좌/우 2면 펼침면 배열로 변환
function buildSpreadsFromQuestions(
  chapterTitle: string,
  era: string,
  coverTone: string,
  questions: InterviewQuestionItem[]
): BookSpread[] {
  if (!questions || questions.length === 0) {
    return [
      {
        leftHeading: chapterTitle,
        leftParagraphs: ['아직 기록된 인터뷰 이야기가 없습니다.'],
        rightCaption: era,
        rightCoverTone: coverTone,
        rightParagraphs: [
          '상단의 [수정하기] 버튼을 눌러 이 시기의 소중한 기억을 직접 작성해 보세요.',
        ],
      },
    ];
  }

  const spreads: BookSpread[] = [];
  for (let i = 0; i < questions.length; i += 2) {
    const firstQa = questions[i].question_answer || '';
    const secondQa = questions[i + 1]?.question_answer || '';

    const firstParagraphs = firstQa
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const secondParagraphs = secondQa
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    spreads.push({
      leftHeading: i === 0 ? chapterTitle : `${chapterTitle} (${Math.floor(i / 2) + 1})`,
      leftParagraphs: firstParagraphs.length > 0 ? firstParagraphs : [firstQa],
      rightCaption: `${era} · 기억의 조각`,
      rightCoverTone: coverTone,
      rightParagraphs:
        secondParagraphs.length > 0
          ? secondParagraphs
          : ['이어지는 이야기를 [수정하기]에서 덧붙여 기록할 수 있습니다.'],
    });
  }

  return spreads;
}

export default function AutobiographyPage({
  onLogout,
  onNavigate,
}: AutobiographyPageProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [chapters, setChapters] = useState<EraChapterItem[]>(() =>
    ERA_CONFIG.map((cfg) => ({
      era: cfg.era,
      chapterNumber: cfg.chapterNumber,
      interview_id: null,
      title: `${cfg.era}의 기록`,
      isCompleted: false,
      spreads: buildSpreadsFromQuestions(`${cfg.era}의 기록`, cfg.era, cfg.coverTone, []),
    }))
  );

  const [selectedChapterIndex, setSelectedChapterIndex] = useState<number>(0);
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState<number>(0);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev' | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string>('');

  // 수정하기 모달 상태
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editLeftBody, setEditLeftBody] = useState('');
  const [editRightBody, setEditRightBody] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // 특정 interview_id의 상세 대화(interviewQs) 조회 (GET /api/interviews/:interview_id)
  const fetchInterviewDetail = async (
    interviewId: number,
    chapterIndex: number,
    chapterTitle: string,
    token: string
  ) => {
    try {
      const res = await fetch(`${API_BASE_URL}/interviews/${interviewId}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return;

      const result = await res.json();
      if (result.success && result.data) {
        const questions: InterviewQuestionItem[] = Array.isArray(result.data.questions)
          ? result.data.questions
          : [];
        const resolvedTitle = result.data.chapter_name || chapterTitle;

        setChapters((prev) =>
          prev.map((item, idx) => {
            if (idx !== chapterIndex) return item;
            const cfg = ERA_CONFIG[idx];
            return {
              ...item,
              interview_id: interviewId,
              title: resolvedTitle,
              isCompleted: questions.length > 0,
              spreads: buildSpreadsFromQuestions(
                resolvedTitle,
                cfg.era,
                cfg.coverTone,
                questions
              ),
            };
          })
        );
      }
    } catch {
      // 개별 상세 조회 실패 시 기본 안내 유지
    }
  };

  // 로그인 사용자 및 자서전 단원 목록 로드 (GET /api/interviews)
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

    const fetchInterviews = async () => {
      setIsLoading(true);
      setFetchError('');
      try {
        const response = await fetch(`${API_BASE_URL}/interviews`, {
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
        if (!response.ok || !result.success) {
          setFetchError(
            result?.error?.message || '자서전 목록을 불러오지 못했습니다.'
          );
          return;
        }

        const list: InterviewSummary[] = Array.isArray(result.data) ? result.data : [];

        // 연령대 순서대로 매칭
        const mapped = ERA_CONFIG.map((cfg, idx) => {
          const matched =
            list.find((item) => item.chapter_name?.includes(cfg.era)) || list[idx] || null;
          const title = matched?.chapter_name || `${cfg.era}의 기록`;

          return {
            era: cfg.era,
            chapterNumber: cfg.chapterNumber,
            interview_id: matched ? matched.interview_id : null,
            title,
            isCompleted: Boolean(matched),
            spreads: buildSpreadsFromQuestions(title, cfg.era, cfg.coverTone, []),
          };
        });

        setChapters(mapped);

        // 존재하는 단원들의 상세 interviewQs 병렬 조회
        await Promise.all(
          mapped.map((chap, idx) =>
            chap.interview_id
              ? fetchInterviewDetail(chap.interview_id, idx, chap.title, token)
              : Promise.resolve()
          )
        );
      } catch {
        setFetchError(
          '서버(http://3.26.210.69:4000)에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchInterviews();
  }, [onLogout]);

  const displayName = user?.username || user?.account_id || '사용자';

  const currentChapter = chapters[selectedChapterIndex] || chapters[0];
  const totalSpreads = currentChapter.spreads.length;
  const safeSpreadIndex = Math.min(currentSpreadIndex, totalSpreads - 1);
  const currentSpread = currentChapter.spreads[safeSpreadIndex];

  // 페이지 번호 계산
  const pageNumbers = useMemo(() => {
    const startPage = safeSpreadIndex * 2 + 1;
    const endPage = startPage + 1;
    const totalPages = totalSpreads * 2;
    return { startPage, endPage, totalPages };
  }, [safeSpreadIndex, totalSpreads]);

  // 연령대 챕터 선택
  const handleSelectChapter = (index: number) => {
    setSelectedChapterIndex(index);
    setCurrentSpreadIndex(0);
    setFlipDirection(null);
  };

  // 책장 넘기기
  const handlePrevPage = () => {
    if (safeSpreadIndex > 0) {
      setFlipDirection('prev');
      setCurrentSpreadIndex((prev) => prev - 1);
      return;
    }
    if (selectedChapterIndex > 0) {
      const prevChapterIdx = selectedChapterIndex - 1;
      setFlipDirection('prev');
      setSelectedChapterIndex(prevChapterIdx);
      setCurrentSpreadIndex(chapters[prevChapterIdx].spreads.length - 1);
    }
  };

  const handleNextPage = () => {
    if (safeSpreadIndex < totalSpreads - 1) {
      setFlipDirection('next');
      setCurrentSpreadIndex((prev) => prev + 1);
      return;
    }
    if (selectedChapterIndex < chapters.length - 1) {
      setFlipDirection('next');
      setSelectedChapterIndex(selectedChapterIndex + 1);
      setCurrentSpreadIndex(0);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditModalOpen) return;
      if (e.key === 'ArrowLeft') handlePrevPage();
      if (e.key === 'ArrowRight') handleNextPage();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // 수정하기 모달 열기
  const handleOpenEditModal = () => {
    setEditTitle(currentChapter.title);
    setEditLeftBody(currentSpread.leftParagraphs.join('\n\n'));
    setEditRightBody(currentSpread.rightParagraphs.join('\n\n'));
    setIsEditModalOpen(true);
  };

  // 수정 내용 백엔드 저장 (POST /api/interviews/message)
  const handleSaveEdit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      alert('자서전 단원 제목을 입력해 주세요.');
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      if (onLogout) onLogout();
      return;
    }

    const combinedMessage = [editLeftBody.trim(), editRightBody.trim()]
      .filter(Boolean)
      .join('\n\n');

    if (!combinedMessage) {
      alert('저장할 자서전 내용을 입력해 주세요.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const chapterNameWithEra = editTitle.includes(currentChapter.era)
        ? editTitle.trim()
        : `[${currentChapter.era}] ${editTitle.trim()}`;

      const response = await fetch(`${API_BASE_URL}/interviews/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          interview_id: currentChapter.interview_id,
          chapter_name: chapterNameWithEra.slice(0, 100),
          user_answer: combinedMessage,
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
        alert(result?.error?.message || '자서전 저장 중 오류가 발생했습니다.');
        return;
      }

      const savedInterviewId: number | null =
        result.data?.interview_id ?? currentChapter.interview_id;

      if (savedInterviewId) {
        await fetchInterviewDetail(
          savedInterviewId,
          selectedChapterIndex,
          chapterNameWithEra,
          token
        );
      }

      setIsEditModalOpen(false);
    } catch {
      alert('서버(http://3.26.210.69:4000)에 연결할 수 없어 저장하지 못했습니다.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleExportPdf = () => {
    window.print();
  };

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

  const isFirstSpreadOverall = selectedChapterIndex === 0 && safeSpreadIndex === 0;
  const isLastSpreadOverall =
    selectedChapterIndex === chapters.length - 1 && safeSpreadIndex === totalSpreads - 1;

  return (
    <div className="min-h-screen w-full bg-[#FAF6F0] text-[#2C221A] flex flex-col font-['Noto_Sans_KR',sans-serif]">
      <style>{`
        @media print {
          header, aside, .no-print { display: none !important; }
          main { padding: 0 !important; background: #ffffff !important; }
          .book-frame { box-shadow: none !important; border: 1px solid #d6ccc2 !important; }
        }
      `}</style>

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

          {/* 중앙 네비게이션 메뉴 ('자서전' 활성화 상태) */}
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
              onClick={(e) => e.preventDefault()}
              className="flex items-center gap-1.5 text-[#2C221A] font-semibold border-b-2 border-[#9B7348] py-5"
            >
              <svg className="w-3.5 h-3.5 text-[#9B7348]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

      {/* 2. 좌우 2단 분할 본문 */}
      <div className="flex-1 w-full max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[290px_1fr]">
        {/* 왼쪽 사이드바 */}
        <aside className="px-6 py-9 lg:border-r border-[#EAE2D6] bg-[#F6EFE6]/60 flex flex-col justify-between">
          <div>
            <div className="mb-8">
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#9B7348] uppercase mb-1.5">
                MY AUTOBIOGRAPHY
              </p>
              <h1 className="font-['Noto_Serif_KR',serif] text-2xl font-bold text-[#2C221A] mb-1">
                {displayName}의 기록
              </h1>
              <p className="text-xs text-[#8C7A68]">
                삶의 조각들이 한 권의 책이 됩니다.
              </p>
            </div>

            <nav aria-label="연령대별 자서전 목차" className="space-y-2.5">
              {chapters.map((chapter, index) => {
                const isSelected = index === selectedChapterIndex;

                return (
                  <button
                    key={chapter.era}
                    type="button"
                    onClick={() => handleSelectChapter(index)}
                    className={`w-full text-left px-4 py-3.5 rounded-2xl transition-all flex items-center justify-between cursor-pointer border ${
                      isSelected
                        ? 'bg-[#EFE7DC] border-[#DFCBB3] shadow-2xs'
                        : 'bg-white/60 hover:bg-white border-transparent hover:border-[#E8E1D9]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`text-[11px] font-bold ${
                          isSelected ? 'text-[#9B7348]' : 'text-[#B5AAA0]'
                        }`}
                      >
                        0{index + 1}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-bold truncate ${
                            isSelected ? 'text-[#2C221A]' : 'text-[#5C4632]'
                          }`}
                        >
                          {chapter.era}
                        </p>
                        <p className="text-[11px] text-[#8C7A68] truncate mt-0.5">
                          {chapter.title}
                        </p>
                      </div>
                    </div>

                    {chapter.isCompleted ? (
                      <span
                        className={`text-xs font-bold shrink-0 ${
                          isSelected ? 'text-[#9B7348]' : 'text-[#B5AAA0]'
                        }`}
                      >
                        ✓
                      </span>
                    ) : (
                      <span className="w-2 h-2 rounded-full border border-[#C4B8AB] shrink-0" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="mt-8 pt-5 border-t border-[#E8E1D9] text-[11px] text-[#8C7A68] leading-relaxed">
            각 시대를 클릭하면 오른쪽 책장에서 해당 시절의 자서전을 펼쳐 읽을 수 있어요.
          </div>
        </aside>

        {/* 오른쪽 자서전 책 미리보기 영역 */}
        <main className="px-5 sm:px-10 py-8 sm:py-10 flex flex-col justify-between bg-[#F3ECE2]/45">
          {fetchError && (
            <div className="mb-5 p-3.5 rounded-2xl bg-[#FCEEEA] border border-[#F3D1C8] text-xs text-[#A84A3A] font-medium no-print">
              {fetchError}
            </div>
          )}

          {/* 상단 자서전 제목 + 오른쪽 '수정하기', 'PDF 내보내기' 버튼 */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#9B7348] uppercase mb-1">
                BOOK PREVIEW · {currentChapter.era}
              </p>
              <h2 className="font-['Noto_Serif_KR',serif] text-2xl sm:text-[26px] font-semibold text-[#2C221A]">
                {currentChapter.title}
              </h2>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 no-print">
              <button
                type="button"
                onClick={handleOpenEditModal}
                className="h-9.5 px-4 rounded-xl bg-[#EAE1D5] hover:bg-[#DFD2C1] text-[#3E2D1E] text-xs font-semibold transition-colors cursor-pointer"
              >
                수정하기
              </button>

              <button
                type="button"
                onClick={handleExportPdf}
                className="h-9.5 px-4 rounded-xl bg-white hover:bg-[#FAF6F0] border border-[#E2D6C7] text-[#3E2D1E] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 text-[#9B7348]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                PDF 내보내기
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="w-full py-28 text-center text-xs text-[#8C7A68]">
              자서전 기록을 불러오는 중입니다...
            </div>
          ) : (
            <>
              {/* 펼쳐진 자서전 책 프레임 (좌/우 2면 스프레드) */}
              <div className="book-frame relative rounded-[22px] p-2.5 sm:p-3.5 bg-[#6E4F33] shadow-lg">
                <div
                  key={`${selectedChapterIndex}-${safeSpreadIndex}`}
                  className={`grid grid-cols-1 md:grid-cols-2 rounded-2xl overflow-hidden bg-[#FFFDF9] border border-[#E2D6C5] transition-opacity duration-300 ${
                    flipDirection ? 'animate-[fadeIn_0.28s_ease-out]' : ''
                  }`}
                >
                  {/* 왼쪽 페이지 */}
                  <div
                    onClick={handlePrevPage}
                    title="클릭하여 이전 장으로 넘기기"
                    className="relative p-7 sm:p-10 bg-gradient-to-l from-[#F6EFE6]/70 via-[#FFFDF9] to-[#FFFDF9] md:border-r border-[#E6DACB] flex flex-col justify-between min-h-[470px] cursor-pointer select-none"
                  >
                    <div>
                      <div className="mb-7">
                        <span className="block text-[10px] text-[#B5AAA0] mb-1">
                          {pageNumbers.startPage}
                        </span>
                        <p className="text-[10px] font-bold tracking-[0.14em] text-[#9B7348] uppercase">
                          {currentChapter.chapterNumber} · {currentChapter.era}
                        </p>
                      </div>

                      <h3 className="font-['Noto_Serif_KR',serif] text-2xl sm:text-[26px] font-bold text-[#2C221A] text-center leading-snug whitespace-pre-line mb-7">
                        {currentSpread.leftHeading}
                      </h3>

                      <div className="space-y-4 text-xs sm:text-[13px] text-[#4A3B2E] leading-7 whitespace-pre-wrap">
                        {currentSpread.leftParagraphs.map((paragraph, pIdx) => (
                          <p key={pIdx}>{paragraph}</p>
                        ))}
                      </div>
                    </div>

                    {currentSpread.leftQuote && (
                      <blockquote className="mt-7 rounded-xl bg-[#F7F1E8] border border-[#ECE2D4] px-4 py-3.5 text-center font-['Noto_Serif_KR',serif] text-[11px] sm:text-xs text-[#6E5D4F] leading-relaxed">
                        {currentSpread.leftQuote}
                      </blockquote>
                    )}
                  </div>

                  {/* 오른쪽 페이지 */}
                  <div
                    onClick={handleNextPage}
                    title="클릭하여 다음 장으로 넘기기"
                    className="relative p-7 sm:p-10 bg-gradient-to-r from-[#F6EFE6]/70 via-[#FFFDF9] to-[#FFFDF9] flex flex-col justify-between min-h-[470px] cursor-pointer select-none"
                  >
                    <div>
                      <div className="text-right mb-5">
                        <span className="text-[10px] text-[#B5AAA0]">
                          {pageNumbers.endPage}
                        </span>
                      </div>

                      <div
                        className={`relative h-44 w-full rounded-xl bg-gradient-to-b ${currentSpread.rightCoverTone} overflow-hidden mb-6 flex items-end p-3.5`}
                      >
                        <svg
                          viewBox="0 0 320 160"
                          className="absolute inset-0 w-full h-full opacity-45"
                          preserveAspectRatio="none"
                        >
                          <circle cx="165" cy="52" r="24" fill="#FFF7E2" opacity="0.85" />
                          <path
                            d="M0 105 Q90 88 180 104 T320 96 L320 160 L0 160 Z"
                            fill="#3F4D3C"
                            opacity="0.6"
                          />
                        </svg>
                        {currentSpread.rightCaption && (
                          <span className="relative z-10 text-[10px] font-medium text-white/90 drop-shadow-2xs">
                            {currentSpread.rightCaption}
                          </span>
                        )}
                      </div>

                      <div className="space-y-4 text-xs sm:text-[13px] text-[#4A3B2E] leading-7 whitespace-pre-wrap">
                        {currentSpread.rightParagraphs.map((paragraph, pIdx) => (
                          <p key={pIdx}>{paragraph}</p>
                        ))}
                      </div>
                    </div>

                    <div className="mt-7 pt-3 border-t border-[#F0E8DD] flex items-center justify-between text-[11px] text-[#8C7A68]">
                      <span>{displayName}의 자서전</span>
                      <span className="font-semibold text-[#9B7348]">{currentChapter.era}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 하단 책장 넘기기 컨트롤 바 */}
              <div className="mt-6 flex items-center justify-center gap-4 no-print">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={isFirstSpreadOverall}
                  aria-label="이전 장으로 넘기기"
                  className="w-9 h-9 rounded-full bg-white hover:bg-[#EFE7DC] disabled:opacity-35 border border-[#E2D6C7] text-[#3E2D1E] flex items-center justify-center shadow-2xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  ‹
                </button>

                <div className="px-4 py-1.5 rounded-full bg-white/80 border border-[#E8E1D9] text-xs font-medium text-[#6E5D4F]">
                  <strong className="text-[#2C221A]">
                    {pageNumbers.startPage}–{pageNumbers.endPage}
                  </strong>{' '}
                  / {pageNumbers.totalPages} 페이지 ({currentChapter.era})
                </div>

                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={isLastSpreadOverall}
                  aria-label="다음 장으로 넘기기"
                  className="w-9 h-9 rounded-full bg-white hover:bg-[#EFE7DC] disabled:opacity-35 border border-[#E2D6C7] text-[#3E2D1E] flex items-center justify-center shadow-2xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  ›
                </button>
              </div>
            </>
          )}
        </main>
      </div>

      {/* 자서전 '수정하기' 모달 (POST /api/interviews/message 연동) */}
      {isEditModalOpen && (
        <div
          onClick={() => setIsEditModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[600px] bg-[#FAF6F0] border border-[#E8E1D9] rounded-3xl p-6 sm:p-8 shadow-xl max-h-[88vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold tracking-[0.14em] text-[#9B7348] uppercase">
                  EDIT AUTOBIOGRAPHY · {currentChapter.era}
                </p>
                <h3 className="font-['Noto_Serif_KR',serif] text-xl font-bold text-[#2C221A]">
                  자서전 내용 기록 및 수정하기
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-[#8C7A68] hover:text-[#2C221A] text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#3E2D1E] mb-1.5">
                  단원 제목 (최대 100자)
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full h-10.5 px-3.5 text-xs sm:text-sm bg-white border border-[#E8E1D9] rounded-xl focus:outline-none focus:border-[#9B7348]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3E2D1E] mb-1.5">
                  왼쪽 페이지 본문
                </label>
                <textarea
                  rows={5}
                  value={editLeftBody}
                  onChange={(e) => setEditLeftBody(e.target.value)}
                  className="w-full p-3.5 text-xs sm:text-sm bg-white border border-[#E8E1D9] rounded-xl leading-6 focus:outline-none focus:border-[#9B7348]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3E2D1E] mb-1.5">
                  오른쪽 페이지 본문
                </label>
                <textarea
                  rows={5}
                  value={editRightBody}
                  onChange={(e) => setEditRightBody(e.target.value)}
                  className="w-full p-3.5 text-xs sm:text-sm bg-white border border-[#E8E1D9] rounded-xl leading-6 focus:outline-none focus:border-[#9B7348]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E8E1D9]">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="h-10 px-4 rounded-xl bg-white border border-[#E8E1D9] text-xs font-semibold text-[#6E5D4F] cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="h-10 px-5 rounded-xl bg-[#9B7348] hover:bg-[#87623B] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  {isSavingEdit ? '저장 중...' : '저장하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}