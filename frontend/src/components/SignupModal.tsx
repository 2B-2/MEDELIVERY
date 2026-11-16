import { useState, type FormEvent } from 'react';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEADMAN_OPTIONS = [7, 14, 30, 60] as const;

export default function SignupModal({ isOpen, onClose }: SignupModalProps) {
  const [step, setStep] = useState<1 | 2>(1);

  // 1단계 입력 상태
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(false);

  // 2단계 추가 정보 상태
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [deadmanDays, setDeadmanDays] = useState<number>(30);

  if (!isOpen) return null;

  const handleClose = () => {
    setStep(1);
    onClose();
  };

  const handleStep1Submit = (e: FormEvent) => {
    e.preventDefault();
    setStep(2);
  };

  const handleFinalSubmit = (e?: FormEvent, skipped = false) => {
    if (e) e.preventDefault();
    const payload = skipped
      ? { userId, email, password, keepLoggedIn }
      : { userId, email, password, keepLoggedIn, name, age, recipientPhone, deadmanDays };

    console.log('회원가입 완료 데이터:', payload);
    alert('회원가입이 완료되었습니다! 로그인해 주세요.');
    handleClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-3 font-['Noto_Sans_KR',sans-serif]"
      onClick={handleClose}
    >
      {/* 스크롤 없이 한 화면에 들어오도록 높이 및 여백 최적화 */}
      <div
        className="relative w-full max-w-[460px] bg-[#FAF6F0] rounded-2xl shadow-xl border border-[#E8E1D9] px-7 py-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 로고 & 닫기(X) 버튼 */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-[#9B7348] flex items-center justify-center text-[#FAF6F0]">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <span className="font-['Noto_Serif_KR',serif] text-xs font-bold tracking-wider text-[#3E2D1E]">
              MEDELIVERY
            </span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="닫기"
            className="w-7 h-7 rounded-full flex items-center justify-center text-[#8C7A68] hover:bg-[#EFE8DE] hover:text-[#2C221A] transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {step === 1 ? (
          /* ================= 1단계: 기본 회원가입 ================= */
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-[#9B7348] uppercase mb-1">
              WELCOME BACK TO YOUR STORY
            </p>
            <h2 className="font-['Noto_Serif_KR',serif] text-[22px] font-semibold text-[#2C221A] leading-tight mb-1">
              만나서 반가워요
            </h2>
            <p className="text-xs text-[#7D6E60] mb-4">
              간직해온 순간들, 오늘도 이어서 기록하세요.
            </p>

            <form onSubmit={handleStep1Submit} className="space-y-2.5">
              {/* 아이디 */}
              <div>
                <label className="block text-[11px] font-semibold text-[#3E2D1E] mb-1">
                  아이디
                </label>
                <input
                  type="text"
                  required
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="아이디를 입력해주세요"
                  className="w-full h-9.5 px-3 text-xs bg-white border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] transition-colors"
                />
              </div>

              {/* 이메일 */}
              <div>
                <label className="block text-[11px] font-semibold text-[#3E2D1E] mb-1">
                  이메일
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hello@example.com"
                  className="w-full h-9.5 px-3 text-xs bg-white border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] transition-colors"
                />
              </div>

              {/* 비밀번호 */}
              <div>
                <label className="block text-[11px] font-semibold text-[#3E2D1E] mb-1">
                  비밀번호
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호를 입력해주세요"
                    className="w-full h-9.5 pl-3 pr-9 text-xs bg-white border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label="비밀번호 표시 전환"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9E9286] hover:text-[#3E2D1E] cursor-pointer"
                  >
                    {showPassword ? (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* 로그인 상태 유지 & 비밀번호 찾기 */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={keepLoggedIn}
                    onChange={(e) => setKeepLoggedIn(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#9B7348] rounded cursor-pointer"
                  />
                  <span className="text-[11px] text-[#7D6E60]">로그인 상태 유지</span>
                </label>

                <button
                  type="button"
                  onClick={() => alert('비밀번호 재설정 안내 메일을 발송합니다.')}
                  className="text-[11px] text-[#9B7348] hover:underline cursor-pointer"
                >
                  비밀번호를 잊으셨나요?
                </button>
              </div>

              {/* 회원가입(다음 단계로) 버튼 */}
              <button
                type="submit"
                className="w-full h-10 mt-1 bg-[#9B7348] hover:bg-[#87623B] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                회원가입
              </button>
            </form>

            {/* 구분선 */}
            <div className="relative my-3.5 flex items-center justify-center">
              <div className="w-full border-t border-[#E8E1D9]" />
              <span className="bg-[#FAF6F0] px-2.5 text-[10px] text-[#9E9286] whitespace-nowrap">
                또는 간편하게 시작
              </span>
            </div>

            {/* 소셜 로그인 버튼 */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => console.log('카카오 간편가입')}
                className="h-9.5 bg-white hover:bg-stone-50 border border-[#E8E1D9] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span className="w-4 h-4 rounded-full bg-[#FEE500] text-[#191919] text-[10px] font-extrabold flex items-center justify-center">
                  K
                </span>
                <span className="text-[11px] font-semibold text-[#2C221A]">카카오로 로그인</span>
              </button>

              <button
                type="button"
                onClick={() => console.log('구글 간편가입')}
                className="h-9.5 bg-white hover:bg-stone-50 border border-[#E8E1D9] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
                  <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
                </svg>
                <span className="text-[11px] font-semibold text-[#2C221A]">Google로 로그인</span>
              </button>
            </div>
          </div>
        ) : (
          /* ================= 2단계: 추가 정보 입력 ================= */
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-[#9B7348] uppercase">
                YOUR STORY STARTS HERE
              </p>
              <span className="text-[10px] font-semibold tracking-wider text-[#9E9286]">
                STEP 2/2
              </span>
            </div>
            <h2 className="font-['Noto_Serif_KR',serif] text-[22px] font-semibold text-[#2C221A] leading-tight mb-1">
              조금 더 알려주세요
            </h2>
            <p className="text-xs text-[#7D6E60] mb-4">
              소중한 기록을 위한 정보예요. 나중에 입력해도 괜찮아요.
            </p>

            <form onSubmit={(e) => handleFinalSubmit(e, false)} className="space-y-2.5">
              {/* 이름 */}
              <div>
                <label className="block text-[11px] font-semibold text-[#3E2D1E] mb-1">
                  이름
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="이름을 입력해주세요"
                  className="w-full h-9.5 px-3 text-xs bg-white border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] transition-colors"
                />
              </div>

              {/* 나이 */}
              <div>
                <label className="block text-[11px] font-semibold text-[#3E2D1E] mb-1">
                  나이
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="나이를 입력해주세요"
                  className="w-full h-9.5 px-3 text-xs bg-white border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] transition-colors"
                />
              </div>

              {/* 수신자 번호 */}
              <div>
                <label className="block text-[11px] font-semibold text-[#3E2D1E] mb-1">
                  수신자 번호
                </label>
                <input
                  type="tel"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  className="w-full h-9.5 px-3 text-xs bg-white border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] transition-colors"
                />
              </div>

              {/* 데드맨 스위치 비로그인 알림 기간 */}
              <div>
                <label className="block text-[11px] font-semibold text-[#3E2D1E] mb-1.5">
                  데드맨 스위치 비로그인 알림 기간
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {DEADMAN_OPTIONS.map((days) => {
                    const isSelected = deadmanDays === days;
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setDeadmanDays(days)}
                        className={`h-8.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#9B7348] text-white border-[#9B7348]'
                            : 'bg-white text-[#5C4B3B] border-[#E8E1D9] hover:border-[#9B7348]'
                        }`}
                      >
                        {days}일
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] leading-[1.45] text-[#8C7A68]">
                  선택한 기간 동안 로그인하지 않으면 지정된 알림을 보내요.
                  <br />
                  설정된 기간이 지나면 기록이 수신자에게 전달되는 구조예요.
                </p>
              </div>

              {/* 이전 / 완료 버튼 */}
              <div className="grid grid-cols-3 gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="col-span-1 h-10 bg-white hover:bg-stone-50 border border-[#E8E1D9] text-[#3E2D1E] text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  이전
                </button>
                <button
                  type="submit"
                  className="col-span-2 h-10 bg-[#9B7348] hover:bg-[#87623B] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  완료
                </button>
              </div>
            </form>

            {/* 하단 건너뛰기 안내 */}
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => handleFinalSubmit(undefined, true)}
                className="text-[11px] font-semibold text-[#9B7348] underline underline-offset-4 hover:text-[#7A5630] cursor-pointer"
              >
                다음에 하기 (건너뛰기)
              </button>
              <p className="mt-1 text-[10px] text-[#9E9286]">
                입력한 정보는 프로필 설정에서 언제든 수정할 수 있어요.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}