import { CheckCircle2, Clock, MapPin, FileCheck, X } from 'lucide-react';

export default function SuccessModal({ isOpen, onClose, data }) {
  if (!isOpen || !data) return null;

  const { guardianName, rut, deliveredBenefits, timestamp, location, isOffline } = data;

  return (
    <div className="modal-backdrop">
      <div className="modal-content success-modal">
        <div className="success-icon-badge">
          <CheckCircle2 size={48} className="text-green" />
        </div>

        <h3 className="success-modal-title">
          {isOffline ? 'Entrega Registrada Localmente' : '¡Entrega Registrada Exitosamente!'}
        </h3>

        <p className="success-modal-subtitle">
          {isOffline
            ? 'Los datos y la fotografía del acta se guardaron en tu dispositivo y se sincronizarán al detectar conexión a internet.'
            : 'El acta física ha sido vinculada y archivada digitalmente con trazabilidad municipal.'}
        </p>

        <div className="success-summary-box">
          <div className="summary-row">
            <span className="summary-label">Apoderado:</span>
            <span className="summary-value">{guardianName || 'Apoderado'}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">RUT:</span>
            <span className="summary-value">{rut}</span>
          </div>

          <div className="summary-row">
            <span className="summary-label">Hora de registro:</span>
            <span className="summary-value meta-with-icon">
              <Clock size={14} />
              <span>{timestamp || new Date().toLocaleTimeString('es-CL')}</span>
            </span>
          </div>

          {location?.latitude && (
            <div className="summary-row">
              <span className="summary-label">Geolocalización:</span>
              <span className="summary-value meta-with-icon">
                <MapPin size={14} />
                <span>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
              </span>
            </div>
          )}

          <div className="summary-delivered-list">
            <span className="summary-label">Beneficios entregados:</span>
            <ul>
              {deliveredBenefits && deliveredBenefits.length > 0 ? (
                deliveredBenefits.map((b, idx) => (
                  <li key={idx}>
                    <FileCheck size={14} className="list-icon" />
                    <span><strong>{b.studentName}</strong> — {b.benefitName}</span>
                  </li>
                ))
              ) : (
                <li>
                  <FileCheck size={14} className="list-icon" />
                  <span>Beneficios marcados entregados</span>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
            Aceptar y Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
