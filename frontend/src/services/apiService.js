import { cleanRut } from '../utils/rutUtils';

const TOKEN_KEY = 'beneficios_token';
const USER_KEY = 'beneficios_user';

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

/**
 * Obtiene los encabezados HTTP estándar con el token JWT
 */
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
  /**
   * Verifica la conectividad con el backend
   */
  async isBackendAvailable() {
    try {
      const res = await fetch('/api/health', {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Iniciar sesión en el backend con credenciales reales (admin o terreno)
   */
  async login(username, password) {
    const res = await fetch('/api/auth/login', {
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

  /**
   * Cerrar sesión
   */
  logout() {
    authStorage.clear();
  },

  /**
   * Obtener usuario actual en sesión
   */
  getCurrentUser() {
    return authStorage.getUser();
  },

  /**
   * Búsqueda de beneficiarios por RUT (apoderado o alumno) en el backend
   */
  async buscarPorRut(rutIngresado) {
    const rutLimpio = cleanRut(rutIngresado);
    if (!rutLimpio) throw new Error('Debe ingresar un RUT válido');

    const res = await fetch(`/api/guardians/${encodeURIComponent(rutLimpio)}`, {
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

  /**
   * Registro de entrega con fotografía de respaldo en el backend
   * @param {Object} payload
   * @param {string} payload.rut - RUT del apoderado
   * @param {string[]} payload.benefitIds - Lista de UUIDs de beneficios a entregar
   * @param {File|Blob} payload.actaFile - Fotografía del acta
   * @param {string} [payload.notes] - Observaciones
   */
  async registrarEntrega({ rut, benefitIds, actaFile, notes }) {
    if (!rut) throw new Error('El RUT del apoderado es obligatorio');
    if (!benefitIds || benefitIds.length === 0) {
      throw new Error('Debe seleccionar al menos un beneficio');
    }
    if (!actaFile) {
      throw new Error('La fotografía del acta firmada es obligatoria');
    }

    const formData = new FormData();
    formData.append('rut', rut);
    formData.append('benefitIds', JSON.stringify(benefitIds));
    formData.append('notes', notes || 'Entrega en terreno');

    // Asegurar que el archivo tenga nombre y extensión
    if (actaFile instanceof Blob && !actaFile.name) {
      formData.append('acta', actaFile, `acta_${Date.now()}.jpg`);
    } else {
      formData.append('acta', actaFile);
    }

    const res = await fetch('/api/deliveries/register', {
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

  /**
   * Obtiene indicadores y métricas de gestión en tiempo real
   */
  async obtenerKpis() {
    const res = await fetch('/api/reports/kpis', {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Error al obtener indicadores');
    }

    return {
      kpis: data.kpis || {},
      deliveriesByDay: data.deliveriesByDay || [],
      deliveriesBySector: data.deliveriesBySector || [],
      // Mapeo retrocompatible para componentes existentes
      totalRegistros: data.kpis?.totalBenefits || 0,
      totalEntregados: data.kpis?.deliveredBenefits || 0,
      totalPendientes: data.kpis?.pendingBenefits || 0,
      entregadosHoy: data.kpis?.deliveriesToday || 0,
      porcentaje: data.kpis?.deliveryPercentage || 0,
    };
  },

  /**
   * Obtiene la nómina de beneficiarios filtrada desde el backend
   */
  async obtenerBeneficiarios({ search = '', estado = 'TODOS' } = {}) {
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (estado && estado !== 'TODOS') query.append('estado', estado);

    const res = await fetch(`/api/beneficiaries?${query.toString()}`, {
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
   */
  async subirPlanillaExcel(file) {
    if (!file) throw new Error('Debe adjuntar un archivo');

    const formData = new FormData();
    formData.append('excel', file);

    const res = await fetch('/api/imports/beneficiaries', {
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

  /**
   * Descarga el reporte CSV anonimizado para la Ley de Transparencia (21.180)
   */
  async exportarTransparenciaCSV() {
    const res = await fetch('/api/reports/transparency.csv', {
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
};
