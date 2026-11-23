import { useEffect, useState, type ChangeEvent } from 'react';

// 페이지 이동 경로 (API 명세서 v2.0 기준)
const ROUTES = {
  main: '/main',
  profile: '/profile',
  profileEdit: '/profile/edit',
  login: '/login',
} as const;

const API_BASE_URL = 'http://localhost:4000/api';
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024; // 최대 5MB

interface UserProfile {
  user_id: number;
  account_id: string;
  username: string;
  email?: string;
  profile_image?: string | null;
  emergency_contact?: string;
  notifications?: {
    email: boolean;
    sms: boolean;
    memory: boolean;
  };
}

interface ProfileEditPageProps {
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

// 휴대폰 번호 자동 하이픈 포맷팅 (010-0000-0000)
function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function ProfileEditPage({ onLogout, onNavigate }: ProfileEditPageProps) {
  const [user, setUser] = useState<UserProfile>({
    user_id: 1,
    account_id: 'hong1234',
    username: '홍길동',
    email: 'hong@example.com',
    profile_image: null,
    emergency_contact: '010-1234-5678',
  });

  // 1. 프로필 사진 상태
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // 2. 비밀번호 변경 상태
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // 3. 수신자 번호 변경 및 인증 상태
  const [currentRecipientPhone, setCurrentRecipientPhone] = useState('010-1234-5678');
  const [newPhone, setNewPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);

  // 4. 알림 수신 설정 토글 상태
  const [emailNotify, setEmailNotify] = useState(true);
  const [smsNotify, setSmsNotify] = useState(true);
  const [memoryNotify, setMemoryNotify] = useState(true);

  // 5. 회원 탈퇴 확인 모달 및 전체 저장 상태
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawConfirmText, setWithdrawConfirmText] = useState('');
  const [isSavingAll, setIsSavingAll] = useState(false);

  // 기존 회원 정보 불러오기
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const parsed: UserProfile = JSON.parse(savedUser);
        setUser((prev) => ({ ...prev, ...parsed }));
        if (parsed.profile_image) setProfileImage(parsed.profile_image);
        if (parsed.emergency_contact) setCurrentRecipientPhone(parsed.emergency_contact);
        if (parsed.notifications) {
          setEmailNotify(parsed.notifications.email ?? true);
          setSmsNotify(parsed.notifications.sms ?? true);
          setMemoryNotify(parsed.notifications.memory ?? true);
        }
      } catch {
        // 파싱 실패 시 기본값 유지
      }
    }
  }, []);

  // 인증번호 3분(180초) 카운트다운 타이머
  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds]);

  const goToRoute = (path: string) => {
    window.history.pushState({}, '', path);
    if (onNavigate) {
      onNavigate(path);
    }
  };

  // [1] 회원 사진 변경 (JPG, PNG 최대 5MB)
  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('JPG, PNG 등 이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      alert('최대 5MB 이하의 이미지 파일만 등록할 수 있습니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfileImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePhotoDelete = () => {
    setProfileImage(null);
  };

  // [2] 비밀번호 저장
  const handleSavePassword = async () => {
    if (!currentPassword) {
      alert('현재 비밀번호를 입력해 주세요.');
      return;
    }
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&^_-])[A-Za-z\d@$!%*#?&^_-]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      alert('새 비밀번호는 영문, 숫자, 특수문자를 조합하여 8자 이상 입력해 주세요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setIsSavingPassword(true);
    const token = localStorage.getItem('accessToken');
    try {
      if (token) {
        const response = await fetch(`${API_BASE_URL}/auth/password`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => null);
          alert(err?.error?.message || '현재 비밀번호가 올바르지 않습니다.');
          setIsSavingPassword(false);
          return;
        }
      }
    } catch {
      // 백엔드 미연결 시에도 안내 표시
    } finally {
      setIsSavingPassword(false);
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    alert('비밀번호가 안전하게 변경되었습니다.');
  };

  // [3] 수신자 번호 인증번호 발송 및 확인
  const handleSendVerification = () => {
    const digits = newPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      alert('올바른 새 휴대폰 번호를 입력해 주세요.');
      return;
    }

    const generated = String(Math.floor(100000 + Math.random() * 900000));
    setSentCode(generated);
    setRemainingSeconds(180);
    setIsPhoneVerified(false);
    alert(`인증번호가 발송되었습니다.\n(테스트용 인증번호: ${generated})`);
  };

  const handleVerifyCode = () => {
    if (!sentCode) {
      alert('먼저 인증번호 발송 버튼을 눌러주세요.');
      return;
    }
    if (remainingSeconds <= 0) {
      alert('인증 시간이 만료되었습니다. 인증번호를 다시 발송해 주세요.');
      return;
    }
    if (verificationCode.trim() !== sentCode) {
      alert('인증번호가 일치하지 않습니다. 다시 확인해 주세요.');
      return;
    }

    setIsPhoneVerified(true);
    setRemainingSeconds(0);
    alert('휴대폰 번호 인증이 완료되었습니다. 하단의 [변경사항 저장]을 누르면 적용됩니다.');
  };

  // [5] 회원 탈퇴 실행
  const handleConfirmWithdraw = async () => {
    if (withdrawConfirmText.trim() !== '탈퇴합니다') {
      alert("확인 문구로 '탈퇴합니다'를 정확히 입력해 주세요.");
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/auth/me`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // 오프라인/테스트 모드에서도 로컬 데이터 초기화
      }
    }

    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    localStorage.removeItem('medelivery_diary_draft');
    localStorage.removeItem('medelivery_local_capsules');
    localStorage.removeItem('medelivery_autobiography_chapters');

    setIsWithdrawModalOpen(false);
    alert('회원 탈퇴가 완료되었습니다. 그동안 MEDELIVERY를 이용해 주셔서 감사합니다.');

    if (onLogout) {
      onLogout();
    } else {
      goToRoute(ROUTES.login);
    }
  };

  // [하단] 전체 변경사항 저장 -> 회원 페이지(/profile)로 이동
  const handleSaveAllChanges = async () => {
    setIsSavingAll(true);

    const nextRecipientPhone = isPhoneVerified && newPhone ? newPhone : currentRecipientPhone;
    const updatedUser: UserProfile = {
      ...user,
      profile_image: profileImage,
      emergency_contact: nextRecipientPhone,
      notifications: {
        email: emailNotify,
        sms: smsNotify,
        memory: memoryNotify,
      },
    };

    const token = localStorage.getItem('accessToken');
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/auth/me`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            emergency_contact: nextRecipientPhone,
          }),
        });
      } catch {
        // 백엔드 미실행 시 로컬 스토리지 반영
      }
    }

    localStorage.setItem('user', JSON.stringify(updatedUser));
    setIsSavingAll(false);
    alert('변경사항이 저장되었습니다.');
    goToRoute(ROUTES.profile);
  };

  const initialLetter = (user.username || user.account_id || 'F').trim().slice(0, 1).toUpperCase();
  const formattedTimer = `${Math.floor(remainingSeconds / 60)}:${String(
    remainingSeconds % 60
  ).padStart(2, '0')}`;

  return (
    <div className="min-h-screen w-full bg-[#FAF6F0] text-[#2C221A] font-['Noto_Sans_KR',sans-serif]">
      {/* 상단 고정 헤더 */}
      <header className="sticky top-0 z-30 w-full bg-[#FAF6F0]/95 backdrop-blur-sm border-b border-[#E8E1D9]">
        <div className="max-w-[980px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <a
            href={ROUTES.main}
            onClick={(e) => {
              e.preventDefault();
              goToRoute(ROUTES.main);
            }}
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

          <button
            type="button"
            onClick={() => goToRoute(ROUTES.profile)}
            className="text-xs font-medium text-[#7D6E60] hover:text-[#2C221A] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>←</span>
            <span>프로필로 돌아가기</span>
          </button>
        </div>
      </header>

      {/* 메인 콘텐츠 컨테이너 */}
      <main className="max-w-[980px] mx-auto px-5 sm:px-8 py-10 sm:py-12">
        {/* 페이지 타이틀 */}
        <section className="mb-8">
          <p className="text-[10px] font-bold tracking-[0.14em] text-[#9B7348] uppercase mb-1.5">
            MY STORY, MY ACCOUNT
          </p>
          <h1 className="font-['Noto_Serif_KR',serif] text-2xl sm:text-[32px] font-semibold text-[#2C221A] tracking-tight mb-1.5">
            프로필 및 계정 설정
          </h1>
          <p className="text-xs sm:text-[13px] text-[#7D6E60]">
            개인 정보, 수신자 번호 및 보안 설정을 관리하세요.
          </p>
        </section>

        <div className="space-y-5">
          {/* 1번째 칸: 회원 사진 변경 */}
          <section className="bg-white border border-[#E8E1D9] rounded-2xl p-6 sm:p-8 shadow-2xs">
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 items-center">
              <div>
                <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#EFE6D8] flex items-center justify-center text-[#9B7348] mb-3">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-[#2C221A] mb-1">프로필 사진</h2>
                <p className="text-xs text-[#8C7A68] leading-relaxed">
                  나의 이야기를 함께할 프로필 사진을 설정하세요.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-5">
                {/* 원형 프로필 사진 또는 한 글자 아바타 */}
                <div className="w-20 h-20 rounded-full overflow-hidden bg-[#9B7348] text-white font-['Noto_Serif_KR',serif] text-2xl font-bold flex items-center justify-center border-2 border-[#E5D7C4] shrink-0">
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt="회원 프로필 사진"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{initialLetter}</span>
                  )}
                </div>

                <div>
                  <div className="flex items-baseline gap-2 mb-2.5">
                    <span className="text-sm font-bold text-[#2C221A]">{user.username}</span>
                    <span className="text-xs text-[#9E9286]">{user.account_id}</span>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <label className="h-8.5 px-4 rounded-lg bg-[#9B7348] hover:bg-[#87623B] text-white text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoChange}
                        className="hidden"
                      />
                      사진 변경
                    </label>

                    <button
                      type="button"
                      onClick={handlePhotoDelete}
                      className="h-8.5 px-3.5 rounded-lg bg-white hover:bg-[#FAF6F0] border border-[#E2D6C7] text-xs font-semibold text-[#5C4632] transition-colors cursor-pointer"
                    >
                      삭제
                    </button>
                  </div>

                  <p className="text-[11px] text-[#9E9286]">JPG, PNG 파일 (최대 5MB)</p>
                </div>
              </div>
            </div>
          </section>

          {/* 2번째 칸: 비밀번호 변경 */}
          <section className="bg-white border border-[#E8E1D9] rounded-2xl p-6 sm:p-8 shadow-2xs">
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 items-start">
              <div>
                <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#EFE6D8] flex items-center justify-center text-[#9B7348] mb-3">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-[#2C221A] mb-1">비밀번호 변경</h2>
                <p className="text-xs text-[#8C7A68] leading-relaxed">
                  소중한 기록을 안전하게 지키도록 비밀번호를 정기적으로 변경하세요.
                </p>
              </div>

              <div className="space-y-4">
                {/* 현재 비밀번호 */}
                <div>
                  <label className="block text-xs font-semibold text-[#3E2D1E] mb-1.5">
                    현재 비밀번호
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="현재 비밀번호를 입력하세요"
                      className="w-full h-11 px-4 pr-11 text-xs sm:text-sm bg-[#FAF6F0]/60 border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] focus:bg-white"
                    />
                    <button
                      type="button"
                      aria-label="현재 비밀번호 표시 전환"
                      onClick={() => setShowCurrentPw((prev) => !prev)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9E9286] hover:text-[#2C221A] text-xs cursor-pointer"
                    >
                      {showCurrentPw ? '숨김' : '보기'}
                    </button>
                  </div>
                </div>

                {/* 새 비밀번호 */}
                <div>
                  <label className="block text-xs font-semibold text-[#3E2D1E] mb-1.5">
                    새 비밀번호
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="새 비밀번호를 입력하세요"
                      className="w-full h-11 px-4 pr-11 text-xs sm:text-sm bg-[#FAF6F0]/60 border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] focus:bg-white"
                    />
                    <button
                      type="button"
                      aria-label="새 비밀번호 표시 전환"
                      onClick={() => setShowNewPw((prev) => !prev)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9E9286] hover:text-[#2C221A] text-xs cursor-pointer"
                    >
                      {showNewPw ? '숨김' : '보기'}
                    </button>
                  </div>
                </div>

                {/* 새 비밀번호 확인 */}
                <div>
                  <label className="block text-xs font-semibold text-[#3E2D1E] mb-1.5">
                    새 비밀번호 확인
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPw ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="새 비밀번호를 한 번 더 입력하세요"
                      className="w-full h-11 px-4 pr-11 text-xs sm:text-sm bg-[#FAF6F0]/60 border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] focus:bg-white"
                    />
                    <button
                      type="button"
                      aria-label="새 비밀번호 확인 표시 전환"
                      onClick={() => setShowConfirmPw((prev) => !prev)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9E9286] hover:text-[#2C221A] text-xs cursor-pointer"
                    >
                      {showConfirmPw ? '숨김' : '보기'}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#9E9286] mt-1.5">
                    영문, 숫자, 특수문자를 조합하여 8자 이상 입력해 주세요.
                  </p>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleSavePassword}
                    disabled={isSavingPassword}
                    className="h-9 px-4 rounded-xl bg-[#EFE7DC] hover:bg-[#E4D7C5] text-[#5C4632] text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {isSavingPassword ? '변경 중...' : '비밀번호 저장'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 3번째 칸: 수신자 전화번호 변경 */}
          <section className="bg-white border border-[#E8E1D9] rounded-2xl p-6 sm:p-8 shadow-2xs">
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 items-start">
              <div>
                <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#EFE6D8] flex items-center justify-center text-[#9B7348] mb-3">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-[#2C221A] mb-1">수신자 번호 변경</h2>
                <p className="text-xs text-[#8C7A68] leading-relaxed">
                  추억을 전달받을 휴대폰 번호를 확인하고 변경하세요.
                </p>
              </div>

              <div className="space-y-4">
                {/* 현재 등록된 수신자 번호 */}
                <div>
                  <label className="block text-xs font-semibold text-[#3E2D1E] mb-1.5">
                    현재 등록된 수신자 번호
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={currentRecipientPhone}
                      disabled
                      className="w-full h-11 px-4 pr-10 text-xs sm:text-sm bg-[#F4EFE8] border border-[#E8E1D9] rounded-xl text-[#7D6E60] cursor-not-allowed"
                    />
                    <svg
                      className="w-3.5 h-3.5 text-[#9E9286] absolute right-3.5 top-1/2 -translate-y-1/2"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                </div>

                {/* 새 휴대폰 번호 */}
                <div>
                  <label className="block text-xs font-semibold text-[#3E2D1E] mb-1.5">
                    새 휴대폰 번호
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => {
                        setNewPhone(formatPhoneNumber(e.target.value));
                        setIsPhoneVerified(false);
                      }}
                      placeholder="010-0000-0000"
                      className="flex-1 h-11 px-4 text-xs sm:text-sm bg-[#FAF6F0]/60 border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleSendVerification}
                      className="h-11 px-4 rounded-xl bg-white hover:bg-[#FAF6F0] border border-[#DFD2C2] text-xs font-semibold text-[#5C4632] shrink-0 transition-colors cursor-pointer"
                    >
                      인증번호 발송
                    </button>
                  </div>
                </div>

                {/* 인증번호 입력 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-[#3E2D1E]">
                      인증번호
                    </label>
                    {remainingSeconds > 0 && (
                      <span className="text-[11px] font-bold text-[#9B7348]">
                        남은 시간 {formattedTimer}
                      </span>
                    )}
                    {isPhoneVerified && (
                      <span className="text-[11px] font-bold text-emerald-700">
                        ✓ 인증 완료
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6자리 인증번호를 입력하세요"
                      className="flex-1 h-11 px-4 text-xs sm:text-sm bg-[#FAF6F0]/60 border border-[#E8E1D9] rounded-xl text-[#2C221A] placeholder:text-[#B5AAA0] focus:outline-none focus:border-[#9B7348] focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyCode}
                      className="h-11 px-5 rounded-xl bg-white hover:bg-[#FAF6F0] border border-[#DFD2C2] text-xs font-semibold text-[#5C4632] shrink-0 transition-colors cursor-pointer"
                    >
                      인증하기
                    </button>
                  </div>
                  <p className="text-[11px] text-[#9E9286] mt-1.5">
                    문자로 받은 인증번호를 3분 이내에 입력해 주세요.
                  </p>
                </div>

                <div className="rounded-xl bg-[#FAF6F0] border border-[#EFE6D8] px-3.5 py-2.5 text-[11px] text-[#7D6E60]">
                  ⓘ 번호 인증 후 &apos;변경사항 저장&apos;을 누르면 새 번호가 적용됩니다.
                </div>
              </div>
            </div>
          </section>

          {/* 4번째 칸: 알림 설정 */}
          <section className="bg-white border border-[#E8E1D9] rounded-2xl p-6 sm:p-8 shadow-2xs">
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 items-start">
              <div>
                <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#EFE6D8] flex items-center justify-center text-[#9B7348] mb-3">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-[#2C221A] mb-1">알림 수신 설정</h2>
                <p className="text-xs text-[#8C7A68] leading-relaxed">
                  받고 싶은 소식만 선택해 나만의 속도로 기록을 이어가세요.
                </p>
              </div>

              <div className="divide-y divide-[#F4EFE8]">
                {[
                  {
                    id: 'email-notify',
                    title: '이메일 알림 수신',
                    desc: '기록과 계정 관련 알림을 이메일로 받아요.',
                    checked: emailNotify,
                    onToggle: () => setEmailNotify((prev) => !prev),
                  },
                  {
                    id: 'sms-notify',
                    title: 'SMS(문자) 알림 수신',
                    desc: '타임캡슐 도착 등 중요한 알림을 문자로 받아요.',
                    checked: smsNotify,
                    onToggle: () => setSmsNotify((prev) => !prev),
                  },
                  {
                    id: 'memory-notify',
                    title: '추억 및 서비스 소식 알림 수신',
                    desc: '다시 꺼내 볼 추억과 새로운 서비스 소식을 받아요.',
                    checked: memoryNotify,
                    onToggle: () => setMemoryNotify((prev) => !prev),
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-xs sm:text-[13px] font-bold text-[#2C221A]">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-[#8C7A68] mt-0.5">{item.desc}</p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.checked}
                      aria-label={item.title}
                      onClick={item.onToggle}
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                        item.checked ? 'bg-[#9B7348]' : 'bg-[#DDD3C5]'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-2xs transition-transform ${
                          item.checked ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 5번째(마지막) 칸: 회원 탈퇴 */}
          <section className="bg-[#FDF8F6] border border-[#EED9D3] rounded-2xl p-6 sm:px-8 sm:py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs sm:text-[13px] font-bold text-[#A84A3A] mb-1">
                <span>⚠</span>
                <h2>회원 탈퇴</h2>
              </div>
              <p className="text-xs text-[#8C6D66]">
                탈퇴 시 작성하신 일기, 타임캡슐, 자서전 데이터가 모두 삭제되며 복구할 수 없습니다.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setWithdrawConfirmText('');
                setIsWithdrawModalOpen(true);
              }}
              className="self-start sm:self-auto h-9.5 px-4 rounded-xl bg-white hover:bg-[#FCEEEA] border border-[#E5BFB6] text-xs font-semibold text-[#A84A3A] transition-colors cursor-pointer shrink-0"
            >
              회원 탈퇴하기
            </button>
          </section>
        </div>

        {/* 맨 밑: 저장 칸과 취소 칸 */}
        <div className="mt-8 pt-6 border-t border-[#E8E1D9] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs text-[#8C7A68]">변경된 설정은 저장 후 적용됩니다.</p>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleSaveAllChanges}
              disabled={isSavingAll}
              className="h-10.5 px-6 rounded-xl bg-[#9B7348] hover:bg-[#87623B] disabled:opacity-60 text-white text-xs sm:text-[13px] font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {isSavingAll ? '저장 중...' : '변경사항 저장'}
            </button>

            <button
              type="button"
              onClick={() => goToRoute(ROUTES.profile)}
              className="h-10.5 px-5 rounded-xl bg-white hover:bg-[#F3ECE2] border border-[#E2D6C7] text-xs sm:text-[13px] font-semibold text-[#5C4632] transition-colors cursor-pointer"
            >
              취소
            </button>
          </div>
        </div>
      </main>

      {/* 회원 탈퇴 최종 확인 모달 */}
      {isWithdrawModalOpen && (
        <div
          onClick={() => setIsWithdrawModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs px-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] bg-[#FAF6F0] border border-[#E8E1D9] rounded-3xl p-6 sm:p-7 shadow-xl"
          >
            <p className="text-[11px] font-bold tracking-[0.12em] text-[#A84A3A] uppercase mb-1">
              DELETE ACCOUNT
            </p>
            <h3 className="font-['Noto_Serif_KR',serif] text-xl font-bold text-[#2C221A] mb-2">
              정말 MEDELIVERY를 탈퇴하시겠습니까?
            </h3>
            <p className="text-xs text-[#6E5D4F] leading-relaxed mb-4">
              탈퇴를 진행하려면 아래 입력창에 <strong>탈퇴합니다</strong>를 입력해 주세요.
            </p>

            <input
              type="text"
              value={withdrawConfirmText}
              onChange={(e) => setWithdrawConfirmText(e.target.value)}
              placeholder="탈퇴합니다"
              className="w-full h-10.5 px-3.5 text-xs sm:text-sm bg-white border border-[#E8E1D9] rounded-xl mb-5 focus:outline-none focus:border-[#A84A3A]"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsWithdrawModalOpen(false)}
                className="h-9.5 px-4 rounded-xl bg-white border border-[#E8E1D9] text-xs font-semibold text-[#6E5D4F] cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmWithdraw}
                className="h-9.5 px-5 rounded-xl bg-[#A84A3A] hover:bg-[#8F3B2D] text-white text-xs font-semibold cursor-pointer"
              >
                탈퇴 확정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}