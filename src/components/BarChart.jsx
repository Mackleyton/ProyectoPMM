export default function BarChart({
  items = [],
  emptyMessage = 'Sin registros disponibles',
}) {
  const actualItems = Array.isArray(items) ? items : [];
  const maxVal = Math.max(...actualItems.map((i) => i.value || 0), 0);
  const maxValue = maxVal > 0 ? maxVal : 1;

  if (actualItems.length === 0 || maxVal === 0) {
    return (
      <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="adaptive-bars-list">
      {actualItems.map((item, idx) => {
        const val = item.value || 0;
        const pct = Math.round((val / maxValue) * 100);
        return (
          <div key={idx} className="adaptive-bar-item">
            <div className="adaptive-bar-header">
              <span className="adaptive-bar-title">{item.label}</span>
              <span className="adaptive-bar-count">
                <strong>{val.toLocaleString('es-CL')}</strong> {val === 1 ? 'registro' : 'registros'}
              </span>
            </div>
            <div className="adaptive-bar-track">
              <div
                className="adaptive-bar-fill"
                style={{
                  width: `${pct}%`,
                  backgroundColor: item.color || '#2563eb',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
