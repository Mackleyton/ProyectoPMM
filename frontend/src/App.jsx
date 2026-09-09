import { useState } from 'react';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import TerrenoView from './pages/TerrenoView';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminBeneficiariosPage from './pages/AdminBeneficiariosPage';
import UploadPage from './pages/UploadPage';

export default function App() {
  // Estado de usuario autenticado
  const [user, setUser] = useState({
    name: 'Funcionario Terreno',
    email: 'terreno.social@quilpue.cl',
    role: 'terreno', // 'terreno' | 'admin'
  });

  // Pestaña activa
  const [currentTab, setCurrentTab] = useState('terreno');

  // Modo simulador de marco de teléfono para pruebas de interfaz móvil en PC
  const [isMobileFrame, setIsMobileFrame] = useState(false);

  function handleLogin(loggedUser) {
    setUser(loggedUser);
    setCurrentTab(loggedUser.role === 'admin' ? 'dashboard' : 'terreno');
  }

  function handleLogout() {
    setUser(null);
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

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
                {currentTab === 'dashboard' && <AdminDashboardPage />}
                {currentTab === 'beneficiarios' && (
                  <AdminBeneficiariosPage onOpenImportModal={() => setCurrentTab('upload')} />
                )}
                {currentTab === 'upload' && (
                  <UploadPage onUploadFinished={() => setCurrentTab('beneficiarios')} />
                )}
              </div>
              <div className="phone-home-indicator" />
            </div>
          </div>
        ) : (
          <div className="standard-view-wrapper">
            {currentTab === 'terreno' && <TerrenoView />}
            {currentTab === 'dashboard' && <AdminDashboardPage />}
            {currentTab === 'beneficiarios' && (
              <AdminBeneficiariosPage onOpenImportModal={() => setCurrentTab('upload')} />
            )}
            {currentTab === 'upload' && (
              <UploadPage onUploadFinished={() => setCurrentTab('beneficiarios')} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
