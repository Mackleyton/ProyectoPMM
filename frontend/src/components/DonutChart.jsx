export default function DonutChart({ data = [] }) {
  // data: [{ label, value, color }]
  const total = data.reduce((acc, item) => acc + item.value, 0) || 1;

  let acumulado = 0;
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76

  const slices = data.map((item) => {
    const pct = item.value / total;
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
          {/* Fondo */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke="#e2e8f0"
            strokeWidth="14"
          />
          {/* Rebanadas */}
          {slices.map((s, idx) => (
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
          <span className="donut-total">{total.toLocaleString('es-CL')}</span>
          <span className="donut-label">Total</span>
        </div>
      </div>

      <div className="donut-legend">
        {slices.map((s, idx) => (
          <div key={idx} className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: s.color }} />
            <span className="legend-name">{s.label}</span>
            <span className="legend-value">
              {s.value.toLocaleString('es-CL')} ({s.pctDisplay}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
