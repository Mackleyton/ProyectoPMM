import { useState, useRef } from 'react';

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  function handleFile(f) {
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) {
      setError('Solo se aceptan archivos .xlsx o .xls');
      return;
    }
    setFile(f);
    setError('');
    setResult(null);
  }

  async function subir(e) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError('');
    setResult(null);

    const form = new FormData();
    form.append('excel', file);

    try {
      const res = await fetch('/apis/upload-excel', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir');
      setResult(data);
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="upload-page-card">
      <h2>Cargar Nueva Planilla</h2>
      <p className="desc">
        Sube un archivo Excel con el mismo formato de la planilla actual. Las entregas ya
        registradas se conservarán.
      </p>

      <div
        className={`file-drop-area${drag ? ' drag-over' : ''}`}
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <div className="drop-icon">{file ? '📊' : '📂'}</div>
        <p className="drop-text">
          {file ? 'Haz clic para cambiar el archivo' : 'Haz clic o arrastra tu archivo Excel aquí'}
        </p>
        {file && <p className="drop-file-name">{file.name}</p>}
      </div>

      <div className="warning-box">
        ⚠️ La nueva planilla reemplazará la actual. Asegúrate de que tenga el mismo formato
        de columnas (Rut_Apoderado, Rut_Alumno, etc.).
      </div>

      {error  && <div className="msg-error">⚠️ {error}</div>}
      {result && (
        <div className="msg-success">
          ✅ Planilla cargada correctamente — {result.registros.toLocaleString('es-CL')} registros disponibles.
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={subir}
        disabled={!file || loading}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {loading ? 'Subiendo…' : '⬆ Subir Planilla'}
      </button>
    </div>
  );
}
