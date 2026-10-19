import { useState } from 'react';
import { Shield, User, Lock, LogIn, AlertCircle, Sparkles } from 'lucide-react';
import { apiService } from '../services/apiService';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Por favor ingresa usuario y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiService.login(username.trim(), password);
      onLogin(data.user);
    } catch (err) {
      setError(err.message || 'Credenciales incorrectas o servidor no disponible.');
    } finally {
      setLoading(false);
    }
  }

  function handleQuickFill(userType) {
    if (userType === 'admin') {
      setUsername('admin');
      setPassword('Admin123!');
    } else {
      setUsername('terreno');
      setPassword('Terreno123!');
    }
    setError('');
  }

  return (
    <div className="login-page-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-shield-badge">
            <Shield size={36} />
          </div>
          <h1 className="login-title">Plataforma de Beneficios</h1>
          <p className="login-subtitle">Dirección de Desarrollo Comunitario (DIDECO) — Quilpué</p>
        </div>

        {error && (
          <div className="login-error-alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Usuario o Correo Institucional</label>
            <div className="input-with-icon">
              <User size={18} className="input-icon" />
              <input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="Ej. admin o terreno"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <div className="input-with-icon">
              <Lock size={18} className="input-icon" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
            <LogIn size={18} />
            <span>{loading ? 'Iniciando sesión…' : 'Ingresar al Sistema'}</span>
          </button>
        </form>

        <div className="login-demo-helper">
          <span className="helper-label">Acceso rápido para pruebas:</span>
          <div className="quick-access-buttons">
            <button
              type="button"
              className="quick-btn admin"
              onClick={() => handleQuickFill('admin')}
              disabled={loading}
            >
              Administrador
            </button>
            <button
              type="button"
              className="quick-btn terreno"
              onClick={() => handleQuickFill('terreno')}
              disabled={loading}
            >
              Operador Terreno
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
