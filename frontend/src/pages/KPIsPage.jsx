import { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';

function formatFecha(iso) {
  if (!iso) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function KPIsPage() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function cargar() {
    setLoading(true);
    setError('');
    try {
      const data = await apiService.obtenerKpis();
      setKpis(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  if (loading) return <div className="msg-empty"><p>Cargando KPIs…</p></div>;
  if (error)   return <div className="msg-error">⚠️ {error}</div>;
  if (!kpis)   return null;

  const totalRegistros = kpis.totalRegistros ?? kpis.kpis?.totalBenefits ?? 0;
  const totalEntregados = kpis.totalEntregados ?? kpis.kpis?.deliveredBenefits ?? 0;
  const porDia = kpis.porDia || kpis.deliveriesByDay || [];
  const pendientes = kpis.totalPendientes ?? Math.max(0, totalRegistros - totalEntregados);
  const pct = totalRegistros > 0 ? Math.round((totalEntregados / totalRegistros) * 100) : 0;
  const maxDia = porDia.length > 0 ? Math.max(...porDia.map((d) => d.total || d.deliveries || 1), 1) : 1;

  // Show last 14 days in order (oldest → newest)
  const diasOrdenados = [...porDia].reverse().slice(-14);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn btn-gray btn-sm" onClick={cargar}>↻ Actualizar</button>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total Registros</div>
          <div className="kpi-value blue">{totalRegistros.toLocaleString('es-CL')}</div>
          <div className="kpi-sub">postulaciones en la planilla</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Entregas Realizadas</div>
          <div className="kpi-value green">{totalEntregados.toLocaleString('es-CL')}</div>
          <div className="kpi-sub">{pct}% del total</div>
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Pendientes</div>
          <div className="kpi-value amber">{pendientes.toLocaleString('es-CL')}</div>
          <div className="kpi-sub">{100 - pct}% sin entregar</div>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-title">Entregas por Día (últimos 14 días)</div>
        {diasOrdenados.length === 0 ? (
          <p style={{ fontSize: '0.88rem', color: '#9ca3af' }}>Aún no hay entregas registradas.</p>
        ) : (
          <div className="bar-chart">
            {diasOrdenados.map((d, idx) => {
              const val = d.total ?? d.deliveries ?? 0;
              const label = d.fecha ? formatFecha(d.fecha) : (d.day || `Día ${idx + 1}`);
              return (
                <div key={d.fecha || d.day || idx} className="bar-row">
                  <span className="bar-label">{label}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(val / maxDia) * 100}%` }}
                    />
                  </div>
                  <span className="bar-count">{val}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
