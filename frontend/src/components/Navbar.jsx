import { useState, useEffect } from 'react';

export default function Navbar({
  user,
  onLogout,
  currentTab,
  onTabChange,
  isMobileFrame,
  onToggleMobileFrame,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detectar si ya está en modo app standalone
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      return; // Ya está instalada como aplicación nativa
    }

    // Detectar iOS Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !window.MSStream;
    if (isIosDevice) {
      setIsIOS(true);
    }

    // Capturar evento PWA en Android, Chrome, Edge
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setCanInstall(false);
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      alert(
        'Para instalar en tu iPhone o iPad:\n\n1. Toca el botón Compartir ⎋ (abajo en la barra de Safari).\n2. Selecciona "Agregar a pantalla de inicio" 📲.\n3. La app quedará lista en tu pantalla.'
      );
    }
  };

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'admin';

  return (
    <header className="main-navbar">
      <div className="navbar-left">
        <button
          className="menu-toggle-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Abrir menú"
        >
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>

        <div className="navbar-brand">
          <img
            src={`${import.meta.env.BASE_URL}assets/logo-white-horiz.png`}
            alt="Municipalidad de Quilpué"
            className="navbar-logo-img"
            onError={(e) => {
              // Si falla la ruta de assets, fallback a logo texto institucional
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="navbar-titles">
            <span className="brand-main">QUILPUÉ</span>
            <span className="brand-sub">MUNICIPALIDAD</span>
          </div>
        </div>
      </div>

      <nav className={`navbar-links ${menuOpen ? 'open' : ''}`}>
        {isAdmin ? (
          <>
            <button
              className={`nav-item-btn ${currentTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => {
                onTabChange('dashboard');
                setMenuOpen(false);
              }}
            >
              📊 Panel de Gestión
            </button>
            <button
              className={`nav-item-btn ${currentTab === 'beneficiarios' ? 'active' : ''}`}
              onClick={() => {
                onTabChange('beneficiarios');
                setMenuOpen(false);
              }}
            >
              👥 Beneficiarios
            </button>
            <button
              className={`nav-item-btn ${currentTab === 'terreno' ? 'active' : ''}`}
              onClick={() => {
                onTabChange('terreno');
                setMenuOpen(false);
              }}
            >
              📱 Modo Terreno
            </button>
            <button
              className={`nav-item-btn ${currentTab === 'upload' ? 'active' : ''}`}
              onClick={() => {
                onTabChange('upload');
                setMenuOpen(false);
              }}
            >
              📤 Importar Planilla
            </button>
          </>
        ) : (
          <>
            <button
              className={`nav-item-btn ${currentTab === 'terreno' ? 'active' : ''}`}
              onClick={() => {
                onTabChange('terreno');
                setMenuOpen(false);
              }}
            >
              🔍 Consultar & Entregar
            </button>
          </>
        )}
      </nav>

      <div className="navbar-right">
        {/* Botón de instalación PWA en móviles / navegadores compatibles */}
        {(canInstall || isIOS) && (
          <button
            type="button"
            className="btn btn-warning btn-sm btn-install-app"
            onClick={handleInstallClick}
            title="Instalar como aplicación en este dispositivo"
          >
            📲 Instalar App
          </button>
        )}

        {/* Toggle para alternar marco de teléfono en escritorio */}
        <button
          className={`device-toggle-btn ${isMobileFrame ? 'active' : ''}`}
          onClick={onToggleMobileFrame}
          title={isMobileFrame ? 'Cambiar a Vista Completa' : 'Simular Pantalla Móvil'}
        >
          {isMobileFrame ? '💻 Vista Completa' : '📱 Simular Móvil'}
        </button>

        <div className="user-profile-badge">
          <span className="user-avatar">{isAdmin ? '👔' : '📋'}</span>
          <div className="user-meta">
            <span className="user-name">{user?.name || 'Funcionario'}</span>
            <span className="user-role">{isAdmin ? 'Administrador' : 'Terreno'}</span>
          </div>
          <button className="logout-btn" onClick={onLogout} title="Cerrar sesión">
            ↩ Salir
          </button>
        </div>
      </div>
    </header>
  );
}
