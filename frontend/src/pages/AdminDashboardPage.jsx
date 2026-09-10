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

  const total = kpis?.totalRegistros ?? 0;
  const entregados = kpis?.totalEntregados ?? 0;
  const pendientes = kpis?.totalPendientes ?? 0;
  const entregadosHoy = kpis?.entregadosHoy ?? 0;
  const avance = total > 0 ? Math.round((entregados / total) * 100) : 0;

  // Datos para el gráfico Donut de Estados
  const donutData = [
    { label: 'Entregados', value: entregados, color: '#16a34a' },
    { label: 'Pendientes', value: pendientes, color: '#2563eb' },
  ];

  // Datos para el gráfico de barras por sector
  const barData = (kpis?.deliveriesBySector && kpis.deliveriesBySector.length > 0)
    ? kpis.deliveriesBySector.map((s, idx) => ({
        label: s.sector,
        value: s.deliveries,
        color: ['#2563eb', '#7c3aed', '#ea580c', '#eab308', '#06b6d4'][idx % 5],
      }))
    : [
        { label: 'Belloto Norte', value: 320, color: '#2563eb' },
        { label: 'Belloto Sur', value: 410, color: '#7c3aed' },
        { label: 'Quilpué Centro', value: 560, color: '#ea580c' },
        { label: 'Canal Chacao', value: 230, color: '#eab308' },
        { label: 'Pompeya', value: 180, color: '#06b6d4' },
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

      {/* TARJETAS KPIS */}
      <div className="kpi-cards-grid">
        {/* Total de beneficiarios */}
        <div className="kpi-stat-card border-gray">
          <span className="kpi-card-label">Total de beneficios</span>
          <div className="kpi-card-value">{total.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc">Padrón total asignado</span>
        </div>

        {/* Entregados (Borde superior amarillo) */}
        <div className="kpi-stat-card border-yellow">
          <span className="kpi-card-label">Entregados</span>
          <div className="kpi-card-value text-yellow">{entregados.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc">
            {avance}% de avance global
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
          <span className="kpi-card-label">Entregados hoy</span>
          <div className="kpi-card-value">{entregadosHoy.toLocaleString('es-CL')}</div>
          <span className="kpi-card-desc">Jornada de terreno actual</span>
        </div>
      </div>

      {/* GRÁFICOS ESTADÍSTICOS */}
      <div className="charts-grid-two">
        {/* Gráfico 1: Entregas por sector */}
        <div className="chart-panel-card">
          <div className="chart-panel-header">
            <h3>Distribución Territorial</h3>
            <span className="chart-panel-badge">Por sector comarcal</span>
          </div>
          <div className="chart-panel-content">
            <BarChart items={barData} />
          </div>
        </div>

        {/* Gráfico 2: Estados de entregas */}
        <div className="chart-panel-card">
          <div className="chart-panel-header">
            <h3>Estado de Cumplimiento</h3>
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
