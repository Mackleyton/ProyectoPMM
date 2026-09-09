import { useState, useEffect } from 'react';
import { apiService } from '../services/apiService';
import DonutChart from '../components/DonutChart';
import BarChart from '../components/BarChart';

export default function AdminDashboardPage() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);

  async function cargarKpis() {
    setLoading(true);
    try {
      const data = await apiService.obtenerKpis();
      setKpis(data);
    } catch (err) {
      console.error('Error cargando KPIs:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarKpis();
  }, []);

  const total = kpis?.totalRegistros || 5248;
  const entregados = kpis?.totalEntregados || 3685;
  const pendientes = kpis?.totalPendientes || 1563;
  const entregadosHoy = kpis?.entregadosHoy || 1348;

  // Datos para el gráfico Donut de Estados
  const donutData = [
    { label: 'Entregados', value: entregados, color: '#2563eb' },
    { label: 'Pendientes', value: pendientes, color: '#a855f7' },
    { label: 'Rechazados / Otros', value: 420, color: '#fbbf24' },
  ];

  // Datos para el gráfico de barras de tiempos de entrega
  const barData = [
    { label: '09:00 - 11:00', value: 380, color: '#3b82f6' },
    { label: '11:00 - 13:00', value: 495, color: '#a855f7' },
    { label: '13:00 - 15:00', value: 620, color: '#f97316' },
    { label: '15:00 - 17:00', value: 245, color: '#fbbf24' },
  ];

  return (
    <div className="admin-dashboard-container">
      <div className="dashboard-header-row">
        <div>
          <h2 className="dashboard-main-title">Panel de Gestión</h2>
          <p className="dashboard-subtitle">
            Monitoreo en tiempo real de la entrega de beneficios escolares — Quilpué
          </p>
        </div>
        <div className="dashboard-actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => apiService.exportarTransparenciaCSV()}
            title="Descargar reporte según Ley 21.180"
          >
            📋 Exportar Ley de Transparencia
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={cargarKpis}
            disabled={loading}
          >
            🔄 {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* TARJETAS KPIS (preliminar2.png - pantalla 5) */}
      <div className="kpi-cards-grid">
        {/* Total de beneficiarios */}
        <div className="kpi-stat-card border-gray">
          <span className="kpi-card-label">Total de beneficiarios</span>
          <div className="kpi-card-value">{total.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc">Padrón total asignado</span>
        </div>

        {/* Entregados (Borde superior amarillo) */}
        <div className="kpi-stat-card border-yellow">
          <span className="kpi-card-label">Entregados</span>
          <div className="kpi-card-value text-yellow">{entregados.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc">
            {Math.round((entregados / total) * 100)}% de avance global
          </span>
        </div>

        {/* Pendientes (Borde superior azul) */}
        <div className="kpi-stat-card border-blue">
          <span className="kpi-card-label">Pendientes</span>
          <div className="kpi-card-value text-blue">{pendientes.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc">Por retirar en los centros</span>
        </div>

        {/* Entregados en el día */}
        <div className="kpi-stat-card border-gray">
          <span className="kpi-card-label">Entregados en el día</span>
          <div className="kpi-card-value">{entregadosHoy.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc">Jornada de terreno actual</span>
        </div>
      </div>

      {/* GRÁFICOS ESTADÍSTICOS (preliminar2.png - pantalla 5) */}
      <div className="charts-grid-two">
        {/* Gráfico 1: Tiempos de entrega */}
        <div className="chart-panel-card">
          <div className="chart-panel-header">
            <h3>Tiempos de entrega</h3>
            <span className="chart-panel-badge">Por franja horaria</span>
          </div>
          <div className="chart-panel-content">
            <BarChart items={barData} />
          </div>
        </div>

        {/* Gráfico 2: Estados de entregas */}
        <div className="chart-panel-card">
          <div className="chart-panel-header">
            <h3>Estados de entregas</h3>
            <span className="chart-panel-badge">Consolidado general</span>
          </div>
          <div className="chart-panel-content">
            <DonutChart data={donutData} />
          </div>
        </div>
      </div>
    </div>
  );
}
