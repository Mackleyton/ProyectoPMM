import { useState, useRef } from 'react';
import EntregaModal from '../components/EntregaModal';

function estadoPill(estado) {
  const e = (estado || '').toLowerCase();
  if (e.includes('aprobada'))  return ['pill pill-aprobada',  estado];
  if (e.includes('rechazada')) return ['pill pill-rechazada', estado];
  if (e.includes('pendiente')) return ['pill pill-pendiente', estado];
  return ['pill pill-default', estado || 'Sin estado'];
}

function Field({ label, value }) {
  const empty = !value;
  return (
    <div className="field">
      <label>{label}</label>
      <span className={empty ? 'empty' : ''}>{empty ? '—' : value}</span>
    </div>
  );
}

function ApoderadoCard({ grupo, onEntregaRegistrada }) {
  const [modalReg, setModalReg] = useState(null);
  const apoderado = grupo[0];

  return (
    <div className="apoderado-card">
      <div className="apoderado-header">
        <span className="apoderado-name">{apoderado.nombre_apoderado || '—'}</span>
        <span className="rut-chip">RUT {apoderado.rut_apoderado}</span>
      </div>

      <div className="apoderado-meta">
        <Field label="Teléfono"       value={apoderado.telefono_apoderado} />
        <Field label="Correo"         value={apoderado.correo_apoderado} />
        <Field label="Dirección"      value={apoderado.direccion} />
        <Field label="Sector"         value={apoderado.sector} />
        <Field label="Fecha Nac."     value={apoderado.fecha_nacimiento_apoderado} />
      </div>

      <div className="alumnos-section">
        <div className="alumnos-title">
          {grupo.length === 1 ? 'Alumno' : `Alumnos (${grupo.length})`}
        </div>

        {grupo.map((r) => {
          const [cls, label] = estadoPill(r.estado);
          return (
            <div key={r.rut_alumno} className="alumno-row">
              <div className="alumno-info">
                <div className="alumno-nombre">{r.nombre_alumno || '—'}</div>
                <div className="alumno-sub">
                  RUT {r.rut_alumno} · {r.nivel_educacional || '—'} · {r.establecimiento || '—'}
                </div>
                {r.fecha_postulacion && (
                  <div className="alumno-sub">Postulación: {r.fecha_postulacion}</div>
                )}
              </div>

              <div className="alumno-actions">
                <span className={cls}>{label}</span>

                {r.entregado ? (
                  <>
                    <span className="pill pill-entregado">✓ Entregado</span>
                    {r.foto_entrega && (
                      <a href={r.foto_entrega} target="_blank" rel="noreferrer">
                        <img src={r.foto_entrega} alt="Foto entrega" className="foto-thumb" />
                      </a>
                    )}
                    {r.fecha_entrega_registro && (
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {new Date(r.fecha_entrega_registro).toLocaleDateString('es-CL')}
                      </span>
                    )}
                  </>
                ) : (
                  r.estado.toLowerCase().includes('aprobada') && (
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => setModalReg(r)}
                    >
                      📦 Registrar Entrega
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modalReg && (
        <EntregaModal
          registro={modalReg}
          onClose={() => setModalReg(null)}
          onSuccess={() => { setModalReg(null); onEntregaRegistrada(); }}
        />
      )}
    </div>
  );
}

export default function BuscarPage() {
  const [rut, setRut] = useState('');
  const [resultados, setResultados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const lastRut = useRef('');

  async function buscar(rutBuscado) {
    const q = (rutBuscado ?? rut).trim();
    if (!q) return;
    lastRut.current = q;

    setLoading(true);
    setError('');
    setResultados(null);

    try {
      const res = await fetch(`/apis/buscar?rut=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error del servidor');
      setResultados(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Group results by rut_apoderado
  function agrupar(lista) {
    const map = new Map();
    for (const r of lista) {
      if (!map.has(r.rut_apoderado)) map.set(r.rut_apoderado, []);
      map.get(r.rut_apoderado).push(r);
    }
    return [...map.values()];
  }

  function limpiar() {
    setRut('');
    setResultados(null);
    setError('');
    lastRut.current = '';
    inputRef.current?.focus();
  }

  const grupos = resultados ? agrupar(resultados.resultados) : [];

  return (
    <>
      <form className="search-box" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
        <label htmlFor="rut-input">RUT a consultar</label>
        <div className="search-row">
          <input
            id="rut-input"
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Ej: 12.345.678-9"
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            autoComplete="off"
          />
          <button className="btn btn-primary" type="submit" disabled={loading || !rut.trim()}>
            {loading ? 'Buscando…' : '🔍 Buscar'}
          </button>
          {resultados !== null && (
            <button className="btn btn-gray" type="button" onClick={limpiar}>
              Limpiar
            </button>
          )}
        </div>
        <p className="hint">Acepta RUT del apoderado o del alumno, con o sin puntos y guión</p>
      </form>

      {error && <div className="msg-error">⚠️ {error}</div>}

      {resultados !== null && resultados.total === 0 && (
        <div className="msg-empty">
          <div className="empty-icon">🔍</div>
          <p>No se encontraron registros para el RUT <strong>{lastRut.current}</strong></p>
        </div>
      )}

      {grupos.length > 0 && (
        <>
          <div className="results-header">
            <span className="results-title">
              Resultados para «{lastRut.current}»
            </span>
            <span className="badge">
              {resultados.total} alumno{resultados.total !== 1 ? 's' : ''}
            </span>
          </div>
          {grupos.map((grupo) => (
            <ApoderadoCard
              key={grupo[0].rut_apoderado}
              grupo={grupo}
              onEntregaRegistrada={() => buscar(lastRut.current)}
            />
          ))}
        </>
      )}
    </>
  );
}
