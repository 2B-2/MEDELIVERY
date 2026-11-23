import { useState } from 'react';
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

function App() {
  const [route, setRoute] = useState<string>('/recipient-archive');

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    setRoute('/login');
  };

  if (route === '/login') {
    return <LoginPage onLoginSuccess={() => setRoute('/main')} />;
  }

  if (route === '/diaries/new') {
    return <DiaryWritePage onLogout={handleLogout} onNavigate={(path) => setRoute(path)} />;
  }

  if (route === '/diaries') {
    return <DiaryListPage onLogout={handleLogout} onNavigate={(path) => setRoute(path)} />;
  }

  if (route === '/time-capsules/new') {
    return <TimeCapsuleWritePage onLogout={handleLogout} onNavigate={(path) => setRoute(path)} />;
  }

  if (route === '/time-capsules') {
    return <TimeCapsuleListPage onLogout={handleLogout} onNavigate={(path) => setRoute(path)} />;
  }

  if (route === '/interviews') {
    return <AutobiographyPage onLogout={handleLogout} onNavigate={(path) => setRoute(path)} />;
  }

  if (route === '/profile/edit') {
    return <ProfileEditPage onLogout={handleLogout} onNavigate={(path) => setRoute(path)} />;
  }

  if (route === '/profile') {
    return <ProfilePage onLogout={handleLogout} onNavigate={(path) => setRoute(path)} />;
  }

  if (route === '/recipient-archive') {
    return <RecipientArchivePage onLogout={handleLogout} onNavigate={(path) => setRoute(path)} />;
  }

  return <MainPage onLogout={handleLogout} onNavigate={(path) => setRoute(path)} />;
}

export default App;