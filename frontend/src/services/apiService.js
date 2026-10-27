import { cleanRut } from '../utils/rutUtils';

const TOKEN_KEY = 'beneficios_token';
const USER_KEY = 'beneficios_user';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export const authStorage = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  },
  getUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setUser(user) {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

function getAuthHeaders(isJson = false) {
  const headers = {};
  const token = authStorage.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

export const apiService = {
  async isBackendAvailable() {
    try {
      const res = await fetch(`${API_BASE}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async login(username, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Error al autenticar con el servidor');
    }

    if (data.token) {
      authStorage.setToken(data.token);
    }
    if (data.user) {
      authStorage.setUser(data.user);
    }

    return data;
  },

  logout() {
    authStorage.clear();
  },

  getCurrentUser() {
    return authStorage.getUser();
  },

  async buscarPorRut(rutIngresado) {
    const rutLimpio = cleanRut(rutIngresado);
    if (!rutLimpio) throw new Error('Debe ingresar un RUT válido');

    const res = await fetch(`${API_BASE}/api/guardians/${encodeURIComponent(rutLimpio)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || `No se encontraron registros para el RUT ${rutIngresado}`);
    }

    return {
      guardian: data.guardian,
      benefits: data.benefits || [],
      message: data.message,
    };
  },

  async registrarEntrega({
    rut,
    benefitIds,
    actaFile,
    notes,
    latitude = null,
    longitude = null,
    captured_at = null,
    sync_status = 'SYNCED',
    duration_seconds = null,
  }) {
    if (!rut) throw new Error('El RUT del apoderado es obligatorio');
    if (!benefitIds || benefitIds.length === 0) {
      throw new Error('Debe seleccionar al menos un beneficio');
    }
    if (!actaFile) {
      throw new Error('La fotografía del acta física firmada es obligatoria');
    }

    const formData = new FormData();
    formData.append('rut', rut);
    formData.append('benefitIds', JSON.stringify(benefitIds));
    formData.append('notes', notes || 'Entrega física en terreno');

    if (latitude !== null && latitude !== undefined) formData.append('latitude', latitude);
    if (longitude !== null && longitude !== undefined) formData.append('longitude', longitude);
    if (captured_at) formData.append('captured_at', captured_at);
    if (sync_status) formData.append('sync_status', sync_status);
    if (duration_seconds !== null && duration_seconds !== undefined) {
      formData.append('duration_seconds', duration_seconds);
    }
    if (actaFile instanceof Blob && !actaFile.name) {
      formData.append('acta', actaFile, `acta_${Date.now()}.jpg`);
    } else {
      formData.append('acta', actaFile);
    }

    const res = await fetch(`${API_BASE}/api/deliveries/register`, {
      method: 'POST',
      headers: getAuthHeaders(false),
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Error al registrar la entrega en el servidor');
    }

    return data;
  },

  async obtenerKpis() {
    const res = await fetch(`${API_BASE}/api/reports/kpis`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Error al obtener indicadores');
    }

    const kpisObj = data.kpis || {};
    const totalRegistros = data.totalBeneficiariosAprobados ?? data.totalRegistros ?? kpisObj.totalBenefits ?? 0;
    const totalEntregados = data.entregadosConActa ?? data.totalEntregados ?? kpisObj.deliveredBenefits ?? 0;
    const totalPendientes = data.pendientesDeRetiro ?? data.totalPendientes ?? kpisObj.pendingBenefits ?? Math.max(0, totalRegistros - totalEntregados);
    const entregadosHoy = data.entregadosHoy ?? kpisObj.deliveriesToday ?? 0;
    const porcentaje = data.porcentaje ?? kpisObj.deliveryPercentage ?? (totalRegistros > 0 ? Number(((totalEntregados / totalRegistros) * 100).toFixed(1)) : 0);

    return {
      ...data, // <-- IMPORTANTE: Pasa todos los campos (stockPorNivel, flujoPorHora, etc.)
      kpis: kpisObj,
      deliveriesByDay: data.deliveriesByDay || data.porDia || [],
      deliveriesBySector: data.deliveriesBySector || data.distribucionSectores || [],
      totalRegistros,
      totalEntregados,
      totalPendientes,
      entregadosHoy,
      porcentaje,
      porDia: data.porDia || data.deliveriesByDay || [],
    };
  },

  async obtenerBeneficiarios({ search = '', estado = 'TODOS' } = {}) {
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (estado && estado !== 'TODOS') query.append('estado', estado);

    const res = await fetch(`${API_BASE}/api/beneficiaries?${query.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Error al consultar beneficiarios');
    }

    return Array.isArray(data) ? data : [];
  },

  /**
   * Carga masiva de planilla Excel (.xlsx / .xls)
   * @param {File} file
   * @param {'update'|'replace'} mode - Modo de importación: 'update' (conserva y añade) o 'replace' (reemplaza todo)
   */
  async subirPlanillaExcel(file, mode = 'update') {
    if (!file) throw new Error('Debe adjuntar un archivo');

    const formData = new FormData();
    formData.append('excel', file);
    formData.append('mode', mode);

    const res = await fetch(`${API_BASE}/api/imports/beneficiaries`, {
      method: 'POST',
      headers: getAuthHeaders(false),
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Error al importar archivo');
    }

    return data;
  },

  async obtenerAuditLogs({ limit = 100, action = '' } = {}) {
    const query = new URLSearchParams();
    if (limit) query.append('limit', limit);
    if (action) query.append('action', action);

    const res = await fetch(`${API_BASE}/api/admin/audit-logs?${query.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Error al obtener bitácora de auditoría');
    }
    return data.logs || [];
  },

  async exportarTransparenciaCSV() {
    const res = await fetch(`${API_BASE}/api/reports/transparency.csv`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      throw new Error('Error al generar reporte de transparencia');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Transparencia_Quilpue_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  },

  async crearUsuarioTerreno({ firstName, lastName, email, password }) {
    return this.crearUsuario({ firstName, lastName, email, password, role: 'FIELD_AGENT' });
  },

  async obtenerUsuarios() {
    const res = await fetch(`${API_BASE}/api/auth/users`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Error al obtener usuarios');
    }
    return data.users || [];
  },

  async crearUsuario({ firstName, lastName, email, password, role = 'FIELD_AGENT' }) {
    const res = await fetch(`${API_BASE}/api/auth/users`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ firstName, lastName, email, password, role }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Error al crear usuario');
    }
    return data;
  },

  async eliminarUsuario(userId) {
    const res = await fetch(`${API_BASE}/api/auth/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Error al eliminar usuario');
    }
    return data;
  },
};
