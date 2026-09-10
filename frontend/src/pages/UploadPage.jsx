import { useState, useRef } from 'react';
import { apiService } from '../services/apiService';

export default function UploadPage({ onUploadFinished }) {
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  function handleFile(f) {
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) {
      setError('Solo se aceptan archivos de planilla Excel (.xlsx o .xls)');
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

    try {
      const res = await apiService.subirPlanillaExcel(file);
      setResult(res);
      setFile(null);
      if (onUploadFinished) onUploadFinished();
    } catch (err) {
      setError(err.message || 'Error al procesar la planilla');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="upload-page-card">
      <div className="upload-card-header">
        <span className="upload-header-icon">📤</span>
        <div>
          <h2>Carga Masiva de Planilla (MCGD)</h2>
          <p className="desc">
            Sube un archivo Excel estandarizado con el padrón comunal de postulantes.
            Las entregas ya registradas y sus actas se conservarán íntegramente.
          </p>
        </div>
      </div>

      <div
        className={`file-drop-area${drag ? ' drag-over' : ''}`}
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFile(e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <div className="drop-icon">{file ? '📊' : '📁'}</div>
        <p className="drop-text">
          {file ? 'Haz clic para cambiar el archivo' : 'Haz clic o arrastra tu archivo Excel aquí'}
        </p>
        {file && <p className="drop-file-name">Archivo seleccionado: <strong>{file.name}</strong></p>}
      </div>

      <div className="warning-box">
        ℹ️ <strong>Estructura requerida:</strong> La planilla debe contener las columnas oficiales:
        <code>Rut_Apoderado</code>, <code>Nombre_Apoderado</code>, <code>Rut_Alumno</code>,
        <code>Nombre_Alumno</code>, <code>Establecimiento</code>, <code>Estado</code>.
      </div>

      {error && <div className="msg-error">⚠️ {error}</div>}
      {result && (
        <div className="msg-success">
          ✅ {result.message || 'Planilla procesada con éxito'} — {result.importedRows ?? result.registros ?? 0} registros importados en el sistema{result.rejectedRows > 0 ? ` (${result.rejectedRows} filas omitidas o rechazadas)` : ''}.
        </div>
      )}

      <button
        className="btn btn-yellow btn-lg"
        onClick={subir}
        disabled={!file || loading}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {loading ? 'Procesando Planilla…' : '⬆ Subir e Importar Padrón'}
      </button>
    </div>
  );
}
