export default function BarChart({
  items = [
    { label: '09:00 - 11:00', value: 65, color: '#3b82f6' },
    { label: '11:00 - 13:00', value: 45, color: '#a855f7' },
    { label: '13:00 - 15:00', value: 82, color: '#f97316' },
    { label: '15:00 - 17:00', value: 30, color: '#fbbf24' },
  ],
}) {
  const maxValue = Math.max(...items.map((i) => i.value), 100);

  return (
    <div className="bar-chart-container">
      <div className="bar-chart-plot">
        {/* Y Axis Grid lines */}
        <div className="chart-grid-lines">
          {[100, 75, 50, 25, 0].map((val) => (
            <div key={val} className="grid-line-row">
              <span className="grid-label">{Math.round((val / 100) * maxValue)}</span>
              <div className="grid-line" />
            </div>
          ))}
        </div>

        {/* Bars */}
        <div className="bars-flex">
          {items.map((item, idx) => {
            const heightPct = Math.round((item.value / maxValue) * 100);
            return (
              <div key={idx} className="bar-column">
                <div className="bar-value-tooltip">{item.value}</div>
                <div className="bar-track-vertical">
                  <div
                    className="bar-fill-vertical"
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
                <span className="bar-x-label">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
