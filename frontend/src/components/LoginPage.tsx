import { useState, type FormEvent } from 'react';
import loginLeftImg from '../assets/LoginPage1.png';
import SignupModal from './SignupModal';

export default function LoginPage() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(true);
  const [isSignupOpen, setIsSignupOpen] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      alert('이용약관 및 개인정보 처리방침에 동의해 주세요.');
      return;
    }
    console.log('로그인 시도:', { userId, password });
  };

  return (
    <div className="min-h-screen w-full bg-[#F2ECE3] flex items-center justify-center p-4 font-['Noto_Sans_KR',sans-serif]">
      {/* 전체 2단 컨테이너 */}
      <div className="w-full max-w-[976px] grid grid-cols-1 md:grid-cols-2 bg-[#FAF6F0] shadow-sm overflow-hidden">
        
        {/* 왼쪽 이미지 영역 */}
        <div className="hidden md:block w-full h-full bg-[#E6D6C1]">
          <img
            src={loginLeftImg}
            alt="MEDELIVERY 오늘의 마음을 오래도록 간직해요"
            className="w-full h-full object-cover block"
          />
        </div>

        {/* 오른쪽 로그인 폼 영역 */}
        <section className="w-full bg-[#FAF6F0] flex flex-col justify-center px-8 sm:px-14 py-12">
          <div className="w-full max-w-[360px] mx-auto">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9B7348] uppercase mb-2.5">
              WELCOME TO MEDELIVERY
            </p>
            <h1 className="font-['Noto_Serif_KR',serif] text-[28px] font-semibold text-[#2C221A] tracking-tight mb-2">
              함께 시작해요
            </h1>
            <p className="text-[13px] text-[#7D6E60] mb-8">
              당신의 모든 순간이 한 편의 이야기가 됩니다.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="userId"
                    className="block text-xs font-semibold text-[#3E2D1E] mb-2"
                  >
                    아이디
                  </label>
                  <input
                    id="userId"
                    type="text"
                    required
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="아이디를 입력해 주세요"
                    className="w-full h-12 px-4 text-[13px] bg-white border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold text-[#3E2D1E] mb-2"
                  >
                    비밀번호
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8자 이상 입력해 주세요"
                    className="w-full h-12 px-4 text-[13px] bg-white border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] transition-colors"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 mt-11 mb-4 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="w-4 h-4 accent-[#9B7348] rounded cursor-pointer"
                />
                <span className="text-xs text-[#7D6E60]">
                  <strong className="font-semibold text-[#3E2D1E]">이용약관</strong> 및{' '}
                  <strong className="font-semibold text-[#3E2D1E]">개인정보 처리방침</strong>에 동의합니다.
                </span>
              </label>

              <button
                type="submit"
                className="w-full h-12 bg-[#9B7348] hover:bg-[#87623B] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
              >
                로그인
              </button>
            </form>

            <div className="relative mt-9 mb-4 flex items-center justify-center">
              <div className="w-full border-t border-[#E8E1D9]" />
              <span className="bg-[#FAF6F0] px-3 text-[11px] text-[#9E9286] whitespace-nowrap">
                또는 간편하게 시작하기
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => console.log('카카오 로그인')}
                className="h-14 bg-white hover:bg-stone-50 border border-[#E8E1D9] rounded-xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 rounded-full bg-[#FEE500] text-[#191919] text-[11px] font-extrabold flex items-center justify-center leading-none">
                  K
                </span>
                <span className="text-xs font-semibold text-[#2C221A]">
                  카카오로 시작하기
                </span>
              </button>

              <button
                type="button"
                onClick={() => console.log('구글 로그인')}
                className="h-14 bg-white hover:bg-stone-50 border border-[#E8E1D9] rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
                  <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
                </svg>
                <span className="text-xs font-semibold text-[#2C221A]">
                  Google로 시작하기
                </span>
              </button>
            </div>

            {/* 회원가입 팝업 열기 버튼 */}
            <p className="text-center text-xs text-[#7D6E60] mt-7">
              계정이 없으신가요?{' '}
              <button
                type="button"
                onClick={() => setIsSignupOpen(true)}
                className="ml-2 font-semibold text-[#9B7348] underline underline-offset-4 hover:text-[#7A5630] cursor-pointer"
              >
                회원가입
              </button>
            </p>
          </div>
        </section>

      </div>

      {/* 회원가입 모달 */}
      <SignupModal
        isOpen={isSignupOpen}
        onClose={() => setIsSignupOpen(false)}
      />
    </div>
  );
}