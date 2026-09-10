export default function SuccessModal({ isOpen, onClose, apoderado, beneficiariosEntregados, fecha }) {
  if (!isOpen) return null;

  return (
    <div className="success-modal-backdrop">
      <div className="success-modal-card">
        {/* Ícono de Checkmark verde idéntico a preliminar.png */}
        <div className="success-circle-outer">
          <div className="success-circle-inner">
            <svg viewBox="0 0 52 52" className="checkmark-svg">
              <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
              <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
            </svg>
          </div>
        </div>

        <h2 className="success-title">Entrega Registrada</h2>

        <div className="success-details">
          {apoderado && (
            <p className="success-sub">
              Apoderado: <strong>{apoderado.nombre_apoderado}</strong>
            </p>
          )}
          <p className="success-rut">RUT: {apoderado?.rut_apoderado}</p>

          {beneficiariosEntregados && beneficiariosEntregados.length > 0 && (
            <div className="success-items-list">
              <span className="items-title">Beneficios despachados:</span>
              <ul>
                {beneficiariosEntregados.map((b) => (
                  <li key={b.rut_alumno}>
                    ✓ {b.nombre_alumno} — <small>{b.nivel_educacional || 'Set Escolar'}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="success-timestamp">
            <span>📅 {fecha || new Date().toLocaleString('es-CL')}</span>
            <span className="secure-badge">🔒 Respaldo Fotográfico Vinculado</span>
          </div>
        </div>

        <button type="button" className="btn btn-warning btn-lg full-width" onClick={onClose}>
          Siguiente Consulta
        </button>
      </div>
    </div>
  );
}
