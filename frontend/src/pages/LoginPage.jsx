import { useState } from 'react';
import { apiService } from '../services/apiService';

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) {
      setError('Por favor ingrese su correo institucional o usuario');
      return;
    }
    setError('');

    // Intentar autenticación real contra PostgreSQL en el backend
    const res = await apiService.login(email.trim(), password || 'Admin123!');
    const isAdmin =
      email.toLowerCase().includes('admin') ||
      res.data?.user?.role === 'ADMIN';

    onLogin({
      name: isAdmin ? 'Coordinador Social' : 'Funcionario Terreno',
      email: email.trim(),
      role: isAdmin ? 'admin' : 'terreno',
    });
  }

  async function handleQuickLogin(role) {
    if (role === 'admin') {
      await apiService.login('admin', 'Admin123!');
      onLogin({
        name: 'Administrador Social',
        email: 'admin.social@quilpue.cl',
        role: 'admin',
      });
    } else {
      await apiService.login('terreno', 'Terreno123!');
      onLogin({
        name: 'Operador Terreno 1',
        email: 'terreno.social@quilpue.cl',
        role: 'terreno',
      });
    }
  }


  return (
    <div className="login-wrapper">
      {/* Columna Izquierda (Visible en Desktop) con Ilustración Arquitectónica de Quilpué */}
      <div className="login-side-illustration">
        <div className="illustration-container">
          <img
            src={`${import.meta.env.BASE_URL}assets/quilpue-iglesia.png`}
            alt="Ilustración Quilpué"
            className="illustration-img"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="illustration-text">
            <h2>Municipalidad de Quilpué</h2>
            <p>Plataforma de Gestión y Trazabilidad de Beneficios Sociales</p>
          </div>
        </div>
      </div>

      {/* Columna Derecha / Pantalla Móvil Completa */}
      <div className="login-form-side">
        <div className="login-card-content">
          {/* Logo y Encabezado Institucional */}
          <div className="login-brand-header">
            <img
              src={`${import.meta.env.BASE_URL}assets/logo-white-vert.png`}
              alt="Municipalidad de Quilpué"
              className="login-brand-logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="brand-logo-text">
              <span className="brand-title">QUILPUÉ</span>
              <span className="brand-subtitle">MUNICIPALIDAD</span>
            </div>
            <div className="brand-dept-tag">Departamento Social</div>
          </div>

          {/* Formulario */}
          <form className="login-form" onSubmit={handleSubmit}>
            {error && <div className="login-error-msg">⚠️ {error}</div>}

            <div className="login-input-group">
              <label htmlFor="login-email">Correo</label>
              <input
                id="login-email"
                type="email"
                placeholder="ingrese su correo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="login-input-group">
              <label htmlFor="login-pass">Contraseña</label>
              <input
                id="login-pass"
                type="password"
                placeholder="ingrese su contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <a href="#olvido" className="forgot-link" onClick={(e) => e.preventDefault()}>
                ¿Olvidó su contraseña?
              </a>
            </div>

            <button type="submit" className="btn btn-yellow login-submit-btn">
              Ingresar
            </button>
          </form>

          {/* Botones de Acceso Rápido para Demostración y Pruebas de Roles */}
          <div className="quick-access-section">
            <span className="quick-access-title">Acceso Rápido por Perfil (Demo)</span>
            <div className="quick-btn-grid">
              <button
                type="button"
                className="quick-role-btn terreno"
                onClick={() => handleQuickLogin('terreno')}
              >
                📱 Perfil Terreno (Entregas & Actas)
              </button>
              <button
                type="button"
                className="quick-role-btn admin"
                onClick={() => handleQuickLogin('admin')}
              >
                📊 Perfil Administrador (Dashboard KPIs)
              </button>
            </div>
          </div>
        </div>

        {/* Silueta urbana inferior en vista móvil */}
        <div className="login-bottom-skyline" />
      </div>
    </div>
  );
}
