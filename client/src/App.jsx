import { useState } from 'react';
import BuscarPage   from './pages/BuscarPage';
import KPIsPage     from './pages/KPIsPage';
import UploadPage   from './pages/UploadPage';

const TABS = [
  { id: 'buscar',  label: '🔍 Consultar' },
  { id: 'kpis',   label: '📊 KPIs' },
  { id: 'upload', label: '📤 Cargar Planilla' },
];

export default function App() {
  const [tab, setTab] = useState('buscar');

  return (
    <div className="layout">
      <header className="header">
        <div className="header-icon">🏫</div>
        <div>
          <h1>Ayuda Escolar — Gestión de Entregas</h1>
          <p>Consulta por RUT, registra entregas y revisa el avance</p>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'buscar' && <BuscarPage />}
      {tab === 'kpis'   && <KPIsPage />}
      {tab === 'upload' && <UploadPage />}
    </div>
  );
}
