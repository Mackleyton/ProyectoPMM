import { useState, useRef } from 'react';

export default function EntregaModal({ registro, onClose, onSuccess }) {
  const [foto, setFoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  function handleFile(file) {
    if (!file) return;
    setFoto(file);
    setPreview(URL.createObjectURL(file));
    setError('');
  }

  function onDrop(e) {
    e.preventDefault();
    setDrag(false);
    handleFile(e.dataTransfer.files[0]);
  }

  async function submit(e) {
    e.preventDefault();
    if (!foto) { setError('Debes subir una foto para validar la entrega'); return; }

    setLoading(true);
    setError('');

    const form = new FormData();
    form.append('rut_apoderado', registro.rut_apoderado);
    form.append('rut_alumno', registro.rut_alumno);
    form.append('foto', foto);

    try {
      const res = await fetch('/apis/entregas', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar');
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Registrar Entrega</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form className="modal-body" onSubmit={submit}>
          <div className="modal-info-box">
            <div><strong>Alumno: </strong>{registro.nombre_alumno}</div>
            <div><strong>RUT: </strong><span>{registro.rut_alumno}</span></div>
            <div><strong>Apoderado: </strong><span>{registro.nombre_apoderado}</span></div>
            <div><strong>Establecimiento: </strong><span>{registro.establecimiento || '—'}</span></div>
          </div>

          {preview && <img src={preview} alt="Vista previa" className="preview-img" />}

          <div
            className={`upload-zone${drag ? ' drag-over' : ''}`}
            onClick={() => inputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <div className="upload-zone-icon">{foto ? '✅' : '📷'}</div>
            <p>{foto ? 'Haz clic para cambiar la foto' : 'Haz clic o arrastra una foto aquí'}</p>
            {foto && <p className="file-name">{foto.name}</p>}
          </div>

          {error && <div className="msg-error">{error}</div>}

          <div className="modal-footer">
            <button type="button" className="btn btn-gray" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-success" disabled={loading || !foto}>
              {loading ? 'Guardando…' : '✓ Confirmar Entrega'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
