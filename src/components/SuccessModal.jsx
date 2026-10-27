export default function SuccessModal({ isOpen, onClose, data }) {
  if (!isOpen || !data) return null;

  const { guardianName, rut, deliveredBenefits, timestamp, location, isOffline } = data;

  return (
    <div className="success-modal-backdrop">
      <div className="success-modal-card">
        <div className="success-circle-outer">
          <div className="success-circle-inner">
            <svg className="checkmark-svg" viewBox="0 0 52 52">
              <circle className="checkmark-circle" cx="26" cy="26" r="23" fill="none" />
              <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
            </svg>
          </div>
        </div>

        <h3 className="success-title">
          {isOffline ? 'Entrega Guardada Localmente' : 'Entrega Registrada'}
        </h3>

        <div className="success-details">
          <div className="success-sub">
            Apoderado: <strong>{guardianName || 'Apoderado'}</strong>
          </div>
          <div className="success-rut">RUT: {rut}</div>

          <div className="success-items-list">
            <span className="items-title">Beneficios entregados:</span>
            <ul>
              {deliveredBenefits && deliveredBenefits.length > 0 ? (
                deliveredBenefits.map((b, idx) => (
                  <li key={idx}>
                    ✓ {b.studentName} <small>({b.benefitName})</small>
                  </li>
                ))
              ) : (
                <li>✓ Beneficios marcados exitosamente</li>
              )}
            </ul>
          </div>

          <div className="success-timestamp">
            <span>Hora: {timestamp || new Date().toLocaleTimeString('es-CL')}</span>
            <span className="secure-badge">
              {isOffline ? 'Modo Offline' : 'Trazabilidad Certificada'}
            </span>
          </div>

          {location?.latitude && (
            <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#64748b' }}>
              GPS: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
            </div>
          )}
        </div>

        <button type="button" className="btn btn-primary full-width" onClick={onClose}>
          Aceptar y continuar
        </button>
      </div>
    </div>
  );
}
