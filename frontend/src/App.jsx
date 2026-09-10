import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import TerrenoView from './pages/TerrenoView';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminBeneficiariosPage from './pages/AdminBeneficiariosPage';
import UploadPage from './pages/UploadPage';
import { apiService } from './services/apiService';

export default function App() {
  // Estado de usuario autenticado obtenido del almacenamiento local
  const [user, setUser] = useState(() => apiService.getCurrentUser());

  // Pestaña activa: Dashboard para administradores, Terreno para agentes de campo
  const [currentTab, setCurrentTab] = useState(() => {
    const initialUser = apiService.getCurrentUser();
    return initialUser?.role === 'ADMIN' ? 'dashboard' : 'terreno';
  });

  // Modo simulador de marco de smartphone para pruebas de diseño móvil
  const [isMobileFrame, setIsMobileFrame] = useState(false);

  function handleLogin(loggedUser) {
    setUser(loggedUser);
    setCurrentTab(loggedUser.role === 'ADMIN' ? 'dashboard' : 'terreno');
  }

  function handleLogout() {
    apiService.logout();
    setUser(null);
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const isAdmin = user.role === 'ADMIN';

  return (
    <div className={`app-root ${isMobileFrame ? 'simulated-mode' : ''}`}>
      <Navbar
        user={user}
        onLogout={handleLogout}
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        isMobileFrame={isMobileFrame}
        onToggleMobileFrame={() => setIsMobileFrame(!isMobileFrame)}
      />

      <main className="app-main-viewport">
        {isMobileFrame ? (
          <div className="smartphone-simulator-wrapper">
            <div className="smartphone-frame">
              <div className="phone-notch">
                <span className="notch-speaker" />
                <span className="notch-camera" />
              </div>
              <div className="phone-screen-content">
                {currentTab === 'terreno' && <TerrenoView />}
                {isAdmin && currentTab === 'dashboard' && <AdminDashboardPage />}
                {isAdmin && currentTab === 'beneficiarios' && (
                  <AdminBeneficiariosPage onOpenImportModal={() => setCurrentTab('upload')} />
                )}
                {isAdmin && currentTab === 'upload' && (
                  <UploadPage onUploadFinished={() => setCurrentTab('beneficiarios')} />
                )}
              </div>
              <div className="phone-home-indicator" />
            </div>
          </div>
        ) : (
          <div className="standard-view-wrapper">
            {currentTab === 'terreno' && <TerrenoView />}
            {isAdmin && currentTab === 'dashboard' && <AdminDashboardPage />}
            {isAdmin && currentTab === 'beneficiarios' && (
              <AdminBeneficiariosPage onOpenImportModal={() => setCurrentTab('upload')} />
            )}
            {isAdmin && currentTab === 'upload' && (
              <UploadPage onUploadFinished={() => setCurrentTab('beneficiarios')} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
