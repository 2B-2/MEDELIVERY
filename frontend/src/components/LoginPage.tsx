import { useState, type FormEvent } from 'react';
import loginIllustration from '../assets/LoginPage1.png';
import SignupModal from './SignupModal';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

const API_BASE_URL = 'http://3.26.210.69:4000/api';

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSignupOpen, setIsSignupOpen] = useState(false);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage('');

    const trimmedId = userId.trim();
    if (!trimmedId || !password) {
      setErrorMessage('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    setIsLoading(true);

    try {
      // MEDELIVERY API v2.0 [ACC-01] 실제 로그인 요청
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: trimmedId,
          password,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success && result.accessToken) {
        localStorage.setItem('accessToken', result.accessToken);
        localStorage.setItem('user', JSON.stringify(result.data));
        onLoginSuccess();
        return;
      }

      setErrorMessage(
        result?.error?.message ||
          result?.message ||
          '아이디 또는 비밀번호가 올바르지 않습니다.'
      );
    } catch {
      setErrorMessage(
        '서버(http://3.26.210.69:4000)에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF6F0] text-[#2C221A] flex items-center justify-center px-4 py-8 font-['Noto_Sans_KR',sans-serif]">
      <div className="w-full max-w-[920px] bg-white border border-[#E8E1D9] rounded-3xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* 왼쪽 일러스트 영역 */}
        <div className="hidden md:flex flex-col justify-between bg-[#F3ECE2] p-10 border-r border-[#E8E1D9]">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <span className="w-7 h-7 rounded-full bg-[#9B7348] text-white text-xs font-bold flex items-center justify-center">
                M
              </span>
              <span className="font-['Noto_Serif_KR',serif] text-sm font-bold tracking-wider text-[#2C221A]">
                MEDELIVERY
              </span>
            </div>
            <h2 className="font-['Noto_Serif_KR',serif] text-2xl font-semibold text-[#2C221A] leading-snug mb-2">
              당신의 오늘을 기록하고,
              <br />
              소중한 사람에게 전합니다.
            </h2>
            <p className="text-xs text-[#7D6E60] leading-relaxed">
              일기, 자서전, 타임캡슐까지 나의 모든 이야기를 안전하게 보관하세요.
            </p>
          </div>

          <div className="my-4 flex items-center justify-center">
            <img
              src={loginIllustration}
              alt="MEDELIVERY 일러스트"
              className="w-full max-h-[260px] object-contain rounded-2xl"
            />
          </div>

          <p className="text-[11px] text-[#9E9286]">
            DEADMAN SWITCH ARCHIVE SERVICE
          </p>
        </div>

        {/* 오른쪽 로그인 폼 영역 */}
        <div className="p-8 sm:p-11 flex flex-col justify-center">
          <div className="mb-8">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9B7348] uppercase mb-1.5">
              WELCOME BACK
            </p>
            <h1 className="font-['Noto_Serif_KR',serif] text-2xl font-bold text-[#2C221A]">
              로그인
            </h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="login-user-id"
                className="block text-xs font-semibold text-[#5C4632] mb-1.5"
              >
                아이디
              </label>
              <input
                id="login-user-id"
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="아이디를 입력하세요"
                className="w-full h-11 px-3.5 text-sm bg-[#FAF6F0] border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-[#5C4632] mb-1.5"
              >
                비밀번호
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                className="w-full h-11 px-3.5 text-sm bg-[#FAF6F0] border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] focus:bg-white transition-colors"
              />
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-[#FCEEEA] border border-[#F3D1C8] text-xs text-[#A84A3A] font-medium">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 mt-2 rounded-xl bg-[#9B7348] hover:bg-[#87623B] disabled:opacity-60 text-white text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {isLoading ? '서버 인증 중...' : '로그인'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#EFE9E1] flex items-center justify-between text-xs text-[#7D6E60]">
            <span>아직 MEDELIVERY 계정이 없으신가요?</span>
            <button
              type="button"
              onClick={() => setIsSignupOpen(true)}
              className="font-semibold text-[#9B7348] hover:underline cursor-pointer"
            >
              회원가입
            </button>
          </div>
        </div>
      </div>

      {/* 회원가입 2단계 모달 */}
      <SignupModal
        isOpen={isSignupOpen}
        onClose={() => setIsSignupOpen(false)}
      />
    </div>
  );
}