export default function DonutChart({ data = [], emptyMessage = 'Sin datos disponibles' }) {
  const actualTotal = data.reduce((acc, item) => acc + (item.value || 0), 0);
  const total = actualTotal || 1;

  let acumulado = 0;
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76

  const slices = data.map((item) => {
    const val = item.value || 0;
    const pct = actualTotal > 0 ? val / total : 0;
    const strokeDasharray = `${pct * circumference} ${circumference}`;
    const strokeDashoffset = -acumulado * circumference;
    acumulado += pct;
    return {
      ...item,
      strokeDasharray,
      strokeDashoffset,
      pctDisplay: Math.round(pct * 100),
    };
  });

  return (
    <div className="donut-chart-container">
      <div className="donut-svg-wrap">
        <svg viewBox="0 0 100 100" className="donut-svg">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke="#e2e8f0"
            strokeWidth="14"
          />
          {actualTotal > 0 &&
            slices.map((s, idx) => (
              <circle
                key={idx}
                cx="50"
                cy="50"
                r={radius}
                fill="transparent"
                stroke={s.color}
                strokeWidth="14"
                strokeDasharray={s.strokeDasharray}
                strokeDashoffset={s.strokeDashoffset}
                transform="rotate(-90 50 50)"
                className="donut-segment"
              />
            ))}
        </svg>
        <div className="donut-center-text">
          <span className="donut-total">{actualTotal.toLocaleString('es-CL')}</span>
          <span className="donut-label">Total</span>
        </div>
      </div>

      <div className="donut-legend">
        {actualTotal > 0 ? (
          slices.map((s, idx) => (
            <div key={idx} className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: s.color }} />
              <span className="legend-name">{s.label}</span>
              <span className="legend-value">
                {(s.value || 0).toLocaleString('es-CL')} ({s.pctDisplay}%)
              </span>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '0.5rem' }}>
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
