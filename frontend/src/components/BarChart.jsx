export default function BarChart({
  items = [
    { label: 'Belloto Norte', value: 320, color: '#2563eb' },
    { label: 'Belloto Sur', value: 410, color: '#7c3aed' },
    { label: 'Quilpué Centro', value: 560, color: '#ea580c' },
    { label: 'Canal Chacao', value: 230, color: '#eab308' },
    { label: 'Pompeya', value: 180, color: '#06b6d4' },
  ],
}) {
  const maxValue = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="adaptive-bars-list">
      {items.map((item, idx) => {
        const pct = Math.round((item.value / maxValue) * 100);
        return (
          <div key={idx} className="adaptive-bar-item">
            <div className="adaptive-bar-header">
              <span className="adaptive-bar-title">{item.label}</span>
              <span className="adaptive-bar-count">
                <strong>{item.value.toLocaleString('es-CL')}</strong> entregas
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
