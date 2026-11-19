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
];

const API_BASE_URL = 'http://localhost:4000/api';
const LOCAL_AUTOBIOGRAPHY_KEY = 'medelivery_autobiography_chapters';

interface UserProfile {
  user_id: number;
  account_id: string;
  username: string;
}

interface BookSpread {
  leftHeading: string;
  leftParagraphs: string[];
  leftQuote?: string;
  rightCaption?: string;
  rightCoverTone: string;
  rightParagraphs: string[];
}

interface AutobiographyChapter {
  interview_id: number;
  era: '10대~20대' | '30대~40대' | '50대~60대' | '70대~80대';
  chapterNumber: string;
  title: string;
  subtitle: string;
  isCompleted: boolean;
  spreads: BookSpread[];
}

interface AutobiographyPageProps {
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

// 10대~20대, 30대~40대, 50대~60대, 70대~80대 순 자서전 데이터
const INITIAL_CHAPTERS: AutobiographyChapter[] = [
  {
    interview_id: 1,
    era: '10대~20대',
    chapterNumber: 'CHAPTER 01',
    title: '나의 찬란했던 스무 살',
    subtitle: '나의 세계를 넓히다',
    isCompleted: true,
    spreads: [
      {
        leftHeading: '나의 세계를\n넓히다',
        leftParagraphs: [
          '처음으로 온전히 나만의 방을 갖게 된 날을 기억한다. 낯선 도시의 작은 창문으로 오후 햇살이 길게 들어왔다.',
          '두려움보다 설렘이 컸던 시절이었다. 무엇이든 될 수 있을 것 같았고, 조금 헤매어도 괜찮다고 믿었다. 그때의 나는 매일 새로운 세계의 문을 열었다.',
        ],
        leftQuote: '“길을 잃었다고 생각한 순간에도 나는 나만의 방향으로 걷고 있었다.”',
        rightCaption: '스물셋, 제주에서의 첫 아침',
        rightCoverTone: 'from-[#DFC49B] via-[#C9AE84] to-[#7D8C75]',
        rightParagraphs: [
          '친구들과 밤새 나누던 이야기, 처음 받은 월급으로 산 엄마의 작은 선물, 혼자 떠난 여행에서 마주한 바다. 모든 처음이 서툴렀지만 그래서 더 눈부셨다.',
          '지금 돌아보면 그 시절의 선택들이 오늘의 나를 만들었다. 완벽하지 않아도 한 걸음씩 내딛는 용기를, 스무 살의 내가 내게 가르쳐 주었다.',
        ],
      },
      {
        leftHeading: '청춘의 골목에서\n만난 사람들',
        leftParagraphs: [
          '강의실 창밖으로 벚꽃이 흩날리던 봄날, 우리는 각자의 꿈을 종이 위에 적어 내려갔다. 어떤 날은 밤을 새워 고민했고, 어떤 날은 사소한 농담에도 한참을 웃었다.',
          '그때 곁을 지켜준 사람들의 따뜻한 말 한마디가 긴 시간을 버티게 해주는 든든한 뿌리가 되어주었다.',
        ],
        leftQuote: '“함께 걸어준 이들이 있었기에 서툰 발걸음도 춤이 될 수 있었다.”',
        rightCaption: '늦봄의 캠퍼스 벤치에서',
        rightCoverTone: 'from-[#E2C9B2] via-[#CFA98B] to-[#96735B]',
        rightParagraphs: [
          '사회로 내딛는 첫 문턱 앞에서 망설이던 밤마다 일기장을 펼쳤다. 작은 글씨로 눌러쓴 다짐들은 시간이 흐른 뒤에도 빛바래지 않는 나침반이 되었다.',
          '그렇게 나의 10대와 20대는 뜨겁고 순수한 계절로 책의 첫 장을 채웠다.',
        ],
      },
    ],
  },
  {
    interview_id: 2,
    era: '30대~40대',
    chapterNumber: 'CHAPTER 02',
    title: '단단하게 뿌리내린 계절',
    subtitle: '나답게 살아가는 법',
    isCompleted: true,
    spreads: [
      {
        leftHeading: '나답게\n살아가는 법',
        leftParagraphs: [
          '서른을 넘기면서 세상의 속도보다 나의 호흡을 먼저 살피는 법을 배웠다. 무작정 달리기보다 어디로 향하고 있는지 자주 멈춰 서서 바라보았다.',
          '책임져야 할 일들이 늘어난 만큼, 마음속 단단한 중심도 함께 자라났다.',
        ],
        leftQuote: '“흔들리지 않는 나무는 없지만, 깊은 뿌리는 결국 계절을 견뎌낸다.”',
        rightCaption: '가을빛이 머물던 주말 오후',
        rightCoverTone: 'from-[#D7BFA8] via-[#B89778] to-[#7B6148]',
        rightParagraphs: [
          '일과 삶 사이에서 균형을 찾아가며 소중한 사람들과 식탁을 마주하는 평범한 저녁이 얼마나 큰 선물인지 깨달았다.',
          '거창한 성취보다 매일의 성실함이 쌓여 만든 오늘이 자랑스러웠던 시간이었다.',
        ],
      },
      {
        leftHeading: '마흔의 창가에서\n바라본 풍경',
        leftParagraphs: [
          '마흔이라는 숫자는 생각보다 온화했다. 남들의 시선에 맞추려 애쓰던 마음을 내려놓자 비로소 내가 진짜 좋아하는 것들이 선명해졌다.',
          '누군가의 든든한 울타리가 되어줄 수 있다는 사실이 삶의 가장 큰 기쁨이 되었다.',
        ],
        leftQuote: '“비워낸 자리마다 더 깊고 고요한 행복이 찾아왔다.”',
        rightCaption: '오래된 서재의 작은 책상',
        rightCoverTone: 'from-[#C8D0D6] via-[#A3B1BD] to-[#687987]',
        rightParagraphs: [
          '지난날의 실수마저도 오늘의 지혜로 바꿀 수 있는 여유가 생겼다. 천천히, 그러나 분명하게 나의 이야기를 써 내려간 계절이었다.',
        ],
      },
    ],
  },
  {
    interview_id: 3,
    era: '50대~60대',
    chapterNumber: 'CHAPTER 03',
    title: '여유와 깊이가 머무는 오후',
    subtitle: '인생의 황금빛 산책',
    isCompleted: true,
    spreads: [
      {
        leftHeading: '인생의\n황금빛 산책',
        leftParagraphs: [
          '쉰을 지나 예순에 이르는 길목에서는 작은 일에도 감사가 깊어졌다. 아침에 마시는 따뜻한 차 한 잔, 창문을 두드리는 빗소리마저 다정하게 다가왔다.',
          '오랜 세월 곁을 지켜준 가족과 친구들의 얼굴에는 함께 건너온 시간의 온기가 담겨 있었다.',
        ],
        leftQuote: '“천천히 걸어야 비로소 보이는 들꽃이 있다는 것을 이제야 안다.”',
        rightCaption: '해 질 녘 강변 산책길',
        rightCoverTone: 'from-[#E4C6A3] via-[#C99E72] to-[#8C643E]',
        rightParagraphs: [
          '바쁘다는 이유로 미뤄두었던 취미를 다시 꺼내고, 새로운 배움 앞에서 다시 어린아이처럼 설레던 날들.',
          '인생의 후반전은 비움이 아니라 또 다른 채움의 시작이었다.',
        ],
      },
    ],
  },
  {
    interview_id: 4,
    era: '70대~80대',
    chapterNumber: 'CHAPTER 04',
    title: '지나온 모든 날들에 건네는 인사',
    subtitle: '앞으로 써 내려갈 이야기',
    isCompleted: false,
    spreads: [
      {
        leftHeading: '지나온 모든 날들에\n건네는 인사',
        leftParagraphs: [
          '긴 강물처럼 흘러온 나의 시간을 한 권의 책으로 묶어보며, 매 순간 최선을 다해 살아온 나 자신에게 조용히 박수를 보낸다.',
          '사랑했고, 웃었고, 때로는 눈물지었던 모든 계절이 모여 지금의 빛나는 이야기가 되었다.',
        ],
        leftQuote: '“나의 삶은 충분히 따뜻했고, 사랑하는 이들에게 남길 이야기로 가득하다.”',
        rightCaption: '햇살이 머무는 정원의 오후',
        rightCoverTone: 'from-[#DFD3C3] via-[#C3B099] to-[#8B765E]',
        rightParagraphs: [
          '이 책을 펼쳐볼 사랑하는 가족들에게 나의 목소리와 온기가 오래도록 전해지기를 바란다.',
          '오늘도 나는 감사한 마음으로 새로운 한 줄을 기록한다.',
        ],
      },
    ],
  },
];

export default function AutobiographyPage({
  onLogout,
  onNavigate,
}: AutobiographyPageProps) {
  const [user, setUser] = useState<UserProfile>({
    user_id: 1,
    account_id: 'fin_user',
    username: '윤서',
  });

  const [chapters, setChapters] = useState<AutobiographyChapter[]>(INITIAL_CHAPTERS);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState<number>(0);
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState<number>(0);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev' | null>(null);

  // 수정하기 모달 상태
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editLeftHeading, setEditLeftHeading] = useState('');
  const [editLeftBody, setEditLeftBody] = useState('');
  const [editLeftQuote, setEditLeftQuote] = useState('');
  const [editRightBody, setEditRightBody] = useState('');

  // 로그인 사용자 및 저장된 자서전 데이터 로드 (API v2.0: GET /api/interviews)
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed.username) {
          setUser((prev) => ({ ...prev, ...parsed }));
        }
      } catch {
        // 파싱 실패 시 기본값 유지
      }
    }

    const savedChapters = localStorage.getItem(LOCAL_AUTOBIOGRAPHY_KEY);
    if (savedChapters) {
      try {
        const parsedChapters = JSON.parse(savedChapters);
        if (Array.isArray(parsedChapters) && parsedChapters.length === 4) {
          setChapters(parsedChapters);
        }
      } catch {
        // 파싱 실패 시 기본값 유지
      }
    }

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const fetchInterviews = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/interviews`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const result = await response.json();
          if (result.success && Array.isArray(result.data) && result.data.length > 0) {
            // 백엔드 chapter_name과 연령대 챕터 연동
            setChapters((prev) =>
              prev.map((chap, idx) =>
                result.data[idx]?.chapter_name
                  ? { ...chap, title: result.data[idx].chapter_name, isCompleted: true }
                  : chap
              )
            );
          }
        }
      } catch {
        // 백엔드 미실행 시 기본 자서전 데이터 유지
      }
    };

    fetchInterviews();
  }, []);

  const currentChapter = chapters[selectedChapterIndex] || chapters[0];
  const totalSpreads = currentChapter.spreads.length;
  const safeSpreadIndex = Math.min(currentSpreadIndex, totalSpreads - 1);
  const currentSpread = currentChapter.spreads[safeSpreadIndex];

  // 페이지 번호 계산 (펼침면 기준 좌/우 페이지 번호)
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

  // 책장 넘기기 (이전 장 / 다음 장)
  const handlePrevPage = () => {
    if (safeSpreadIndex > 0) {
      setFlipDirection('prev');
      setCurrentSpreadIndex((prev) => prev - 1);
      return;
    }
    // 첫 장에서 이전 버튼을 누르면 이전 연령대 챕터의 마지막 장으로 이동
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
    // 마지막 장에서 다음 버튼을 누르면 다음 연령대 챕터의 첫 장으로 이동
    if (selectedChapterIndex < chapters.length - 1) {
      setFlipDirection('next');
      setSelectedChapterIndex(selectedChapterIndex + 1);
      setCurrentSpreadIndex(0);
    }
  };

  // 키보드 좌우 화살표로도 책장 넘기기 지원
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
    setEditLeftHeading(currentSpread.leftHeading);
    setEditLeftBody(currentSpread.leftParagraphs.join('\n\n'));
    setEditLeftQuote(currentSpread.leftQuote || '');
    setEditRightBody(currentSpread.rightParagraphs.join('\n\n'));
    setIsEditModalOpen(true);
  };

  // 수정 내용 저장
  const handleSaveEdit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      alert('자서전 제목을 입력해 주세요.');
      return;
    }

    const updatedChapters = chapters.map((chap, cIdx) => {
      if (cIdx !== selectedChapterIndex) return chap;
      const updatedSpreads = chap.spreads.map((sp, sIdx) => {
        if (sIdx !== safeSpreadIndex) return sp;
        return {
          ...sp,
          leftHeading: editLeftHeading.trim() || sp.leftHeading,
          leftParagraphs: editLeftBody
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean),
          leftQuote: editLeftQuote.trim() || undefined,
          rightParagraphs: editRightBody
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean),
        };
      });

      return {
        ...chap,
        title: editTitle.trim(),
        isCompleted: true,
        spreads: updatedSpreads,
      };
    });

    setChapters(updatedChapters);
    localStorage.setItem(LOCAL_AUTOBIOGRAPHY_KEY, JSON.stringify(updatedChapters));
    setIsEditModalOpen(false);
  };

  // PDF 내보내기 실행
  const handleExportPdf = () => {
    window.print();
  };

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
    alert(`'${label}' 화면으로 이동합니다. (임시 연결 경로: ${path})`);
  };

  const isFirstSpreadOverall = selectedChapterIndex === 0 && safeSpreadIndex === 0;
  const isLastSpreadOverall =
    selectedChapterIndex === chapters.length - 1 && safeSpreadIndex === totalSpreads - 1;

  return (
    <div className="min-h-screen w-full bg-[#FAF6F0] text-[#2C221A] flex flex-col font-['Noto_Sans_KR',sans-serif]">
      {/* 인쇄(PDF 내보내기) 전용 스타일 */}
      <style>{`
        @media print {
          header, aside, .no-print { display: none !important; }
          main { padding: 0 !important; background: #ffffff !important; }
          .book-frame { box-shadow: none !important; border: 1px solid #d6ccc2 !important; }
        }
      `}</style>

      {/* 1. 상단 고정 헤더 (기존 페이지와 동일) */}
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

      {/* 2. 좌우 2단 분할 본문 */}
      <div className="flex-1 w-full max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[290px_1fr]">
        {/* 왼쪽 사이드바: 회원 이름 + 10대~20대 / 30대~40대 / 50대~60대 / 70대~80대 목차 */}
        <aside className="px-6 py-9 lg:border-r border-[#EAE2D6] bg-[#F6EFE6]/60 flex flex-col justify-between">
          <div>
            {/* 회원 이름 영역 */}
            <div className="mb-8">
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#9B7348] uppercase mb-1.5">
                MY AUTOBIOGRAPHY
              </p>
              <h1 className="font-['Noto_Serif_KR',serif] text-2xl font-bold text-[#2C221A] mb-1">
                {user.username || 'FIN'}의 기록
              </h1>
              <p className="text-xs text-[#8C7A68]">
                삶의 조각들이 한 권의 책이 됩니다.
              </p>
            </div>

            {/* 연령대별 목차 리스트 (10대~20대, 30대~40대, 50대~60대, 70대~80대 순) */}
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

            {/* 제목 옆 수정하기 / PDF 내보내기 버튼 */}
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

          {/* 펼쳐진 자서전 책 프레임 (좌/우 2면 스프레드) */}
          <div className="book-frame relative rounded-[22px] p-2.5 sm:p-3.5 bg-[#6E4F33] shadow-lg">
            {/* 책 속지 2면 그리드 */}
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
                  {/* 상단 페이지 번호 & 챕터 표기 */}
                  <div className="mb-7">
                    <span className="block text-[10px] text-[#B5AAA0] mb-1">
                      {pageNumbers.startPage}
                    </span>
                    <p className="text-[10px] font-bold tracking-[0.14em] text-[#9B7348] uppercase">
                      {currentChapter.chapterNumber} · {currentChapter.era}
                    </p>
                  </div>

                  {/* 왼쪽 페이지 장 제목 */}
                  <h3 className="font-['Noto_Serif_KR',serif] text-2xl sm:text-[26px] font-bold text-[#2C221A] text-center leading-snug whitespace-pre-line mb-7">
                    {currentSpread.leftHeading}
                  </h3>

                  {/* 본문 단락 */}
                  <div className="space-y-4 text-xs sm:text-[13px] text-[#4A3B2E] leading-7">
                    {currentSpread.leftParagraphs.map((paragraph, pIdx) => (
                      <p key={pIdx}>{paragraph}</p>
                    ))}
                  </div>
                </div>

                {/* 하단 인용구 박스 */}
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
                  {/* 우측 상단 페이지 번호 */}
                  <div className="text-right mb-5">
                    <span className="text-[10px] text-[#B5AAA0]">
                      {pageNumbers.endPage}
                    </span>
                  </div>

                  {/* 감성 일러스트 삽화 카드 */}
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

                  {/* 오른쪽 페이지 이어지는 본문 */}
                  <div className="space-y-4 text-xs sm:text-[13px] text-[#4A3B2E] leading-7">
                    {currentSpread.rightParagraphs.map((paragraph, pIdx) => (
                      <p key={pIdx}>{paragraph}</p>
                    ))}
                  </div>
                </div>

                {/* 하단 시대 안내 뱃지 */}
                <div className="mt-7 pt-3 border-t border-[#F0E8DD] flex items-center justify-between text-[11px] text-[#8C7A68]">
                  <span>{user.username || 'FIN'}의 자서전</span>
                  <span className="font-semibold text-[#9B7348]">{currentChapter.era}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 하단 책장 넘기기 컨트롤 바 (< 1–2 / 4 페이지 >) */}
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
        </main>
      </div>

      {/* 자서전 '수정하기' 모달 */}
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
                  자서전 내용 수정하기
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
                  챕터 대표 제목
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full h-10.5 px-3.5 text-xs sm:text-sm bg-white border border-[#E8E1D9] rounded-xl focus:outline-none focus:border-[#9B7348]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3E2D1E] mb-1.5">
                  왼쪽 페이지 소제목
                </label>
                <input
                  type="text"
                  value={editLeftHeading}
                  onChange={(e) => setEditLeftHeading(e.target.value)}
                  className="w-full h-10.5 px-3.5 text-xs sm:text-sm bg-white border border-[#E8E1D9] rounded-xl focus:outline-none focus:border-[#9B7348]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3E2D1E] mb-1.5">
                  왼쪽 페이지 본문 (빈 줄로 문단 구분)
                </label>
                <textarea
                  rows={4}
                  value={editLeftBody}
                  onChange={(e) => setEditLeftBody(e.target.value)}
                  className="w-full p-3.5 text-xs sm:text-sm bg-white border border-[#E8E1D9] rounded-xl leading-6 focus:outline-none focus:border-[#9B7348]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3E2D1E] mb-1.5">
                  기억에 남는 한 문장 (인용구)
                </label>
                <input
                  type="text"
                  value={editLeftQuote}
                  onChange={(e) => setEditLeftQuote(e.target.value)}
                  className="w-full h-10.5 px-3.5 text-xs sm:text-sm bg-white border border-[#E8E1D9] rounded-xl focus:outline-none focus:border-[#9B7348]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#3E2D1E] mb-1.5">
                  오른쪽 페이지 본문 (빈 줄로 문단 구분)
                </label>
                <textarea
                  rows={4}
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
                  className="h-10 px-5 rounded-xl bg-[#9B7348] hover:bg-[#87623B] text-white text-xs font-semibold cursor-pointer"
                >
                  수정 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}