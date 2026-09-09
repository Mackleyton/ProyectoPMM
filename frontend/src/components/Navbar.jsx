import { useState } from 'react';

export default function Navbar({
  user,
  onLogout,
  currentTab,
  onTabChange,
  isMobileFrame,
  onToggleMobileFrame,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = user?.role === 'admin';

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
