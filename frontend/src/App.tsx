import { useEffect, useState } from 'react';
import LoginPage from './components/LoginPage';
import MainPage from './components/MainPage';
import DiaryWritePage from './components/DiaryWritePage';
import DiaryListPage from './components/DiaryListPage';
import TimeCapsuleListPage from './components/TimeCapsuleListPage';
import TimeCapsuleWritePage from './components/TimeCapsuleWritePage';
import AutobiographyPage from './components/AutobiographyPage';
import ProfilePage from './components/ProfilePage';
import ProfileEditPage from './components/ProfileEditPage';
import RecipientArchivePage from './components/RecipientArchivePage';

const API_BASE_URL = 'http://3.26.210.69:4000/api';

const PUBLIC_ROUTES = ['/login', '/recipient-archive'];

function getInitialRoute(): string {
  const path = window.location.pathname;
  const token = localStorage.getItem('accessToken');

  if (path === '/recipient-archive') {
    return '/recipient-archive';
  }

  if (!token) {
    return '/login';
  }

  if (!path || path === '/' || path === '/login') {
    return '/main';
  }

  return path;
}

function App() {
  const [route, setRoute] = useState<string>(getInitialRoute);

  const navigate = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setRoute(path);
  };

  useEffect(() => {
    const handlePopState = () => {
      const currentPath = window.location.pathname || '/main';
      const token = localStorage.getItem('accessToken');
      if (!token && !PUBLIC_ROUTES.includes(currentPath)) {
        setRoute('/login');
        return;
      }
      setRoute(currentPath);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleLogout = async () => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // 로그아웃 API 네트워크 오류 시에도 클라이언트 세션은 즉시 만료 처리
      }
    }

    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (route === '/login') {
    return <LoginPage onLoginSuccess={() => navigate('/main')} />;
  }

  if (route === '/diaries/new') {
    return <DiaryWritePage onLogout={handleLogout} onNavigate={navigate} />;
  }

  if (route === '/diaries') {
    return <DiaryListPage onLogout={handleLogout} onNavigate={navigate} />;
  }

  if (route === '/time-capsules/new') {
    return <TimeCapsuleWritePage onLogout={handleLogout} onNavigate={navigate} />;
  }

  if (route === '/time-capsules') {
    return <TimeCapsuleListPage onLogout={handleLogout} onNavigate={navigate} />;
  }

  if (route === '/interviews') {
    return <AutobiographyPage onLogout={handleLogout} onNavigate={navigate} />;
  }

  if (route === '/profile/edit') {
    return <ProfileEditPage onLogout={handleLogout} onNavigate={navigate} />;
  }

  if (route === '/profile') {
    return <ProfilePage onLogout={handleLogout} onNavigate={navigate} />;
  }

  if (route === '/recipient-archive') {
    return <RecipientArchivePage onLogout={handleLogout} onNavigate={navigate} />;
  }

  return <MainPage onLogout={handleLogout} onNavigate={navigate} />;
}

export default App;