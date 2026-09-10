# ProyectoPMM - Plataforma de Gestión y Trazabilidad de Beneficios Sociales
### Ilustre Municipalidad de Quilpué - Dirección de Desarrollo Comunitario (DIDECO)

Este proyecto unifica la aplicación web y móvil (**Frontend**) con la API de persistencia en PostgreSQL (**Backend**) en una arquitectura limpia, modular y fácil de desplegar.

---

## 📁 Estructura del Proyecto

```text
ProyectoPMM/
├── backend/
│   ├── database/
│   │   └── init.sql            # Script DDL de PostgreSQL (tablas, índices, llaves)
│   ├── uploads/actas/          # Directorio local de almacenamiento de actas fotográficas
│   ├── create-users.js         # Script para sembrar usuarios iniciales (admin y terreno)
│   ├── server.js               # API REST Express con JWT, importador Excel y reportes
│   ├── .env                    # Variables de entorno (puertos, credenciales DB, JWT)
│   ├── .env.example            # Plantilla de configuración
│   └── package.json            # Dependencias del backend
├── frontend/
│   ├── src/
│   │   ├── pages/              # Vistas: TerrenoView, AdminDashboard, AdminBeneficiarios, etc.
│   │   ├── components/         # Componentes: CameraModal, Navbar, Sidebar, etc.
│   │   ├── services/           # apiService con fallback offline y authStorage JWT
│   │   └── mocks/              # mockBeneficiarios.json (1.762 registros de prueba)
│   ├── vite.config.js          # Configuración Vite con proxy a localhost:3000 y PWA
│   └── package.json            # Dependencias del frontend
├── docker-compose.yml          # Contenedor PostgreSQL 16 preconfigurado
├── package.json                # Scripts npm globales para automatizar todo el ciclo
└── README.md                   # Esta documentación
```

---

## 🚀 Puesta en Marcha Rápida

### 1. Instalación de dependencias
Desde la raíz del proyecto (`ProyectoPMM`):
```bash
npm run install:all
```
*(Opcionalmente, puedes entrar a `backend` y `frontend` y ejecutar `npm install` en cada uno).*

---

### 2. Base de Datos (PostgreSQL)

Tienes dos opciones:

#### Opción A: Con Docker (Recomendada)
Si tienes Docker Desktop / Docker instalado:
```bash
docker compose up -d
```
Esto levantará PostgreSQL 16 en el puerto `5432` y ejecutará automáticamente `backend/database/init.sql`.

#### Opción B: Servicio Local de PostgreSQL
Si ya tienes PostgreSQL corriendo localmente en el puerto `5432`:
1. Crea la base de datos `beneficios_db`.
2. Ejecuta el script `backend/database/init.sql`:
   ```bash
   psql -U postgres -d beneficios_db -f backend/database/init.sql
   ```

---

### 3. Crear Usuarios Iniciales
Una vez que PostgreSQL esté activo, ejecuta el script de siembra de usuarios:
```bash
npm run create-users
```
Esto creará dos usuarios con contraseñas encriptadas con `bcrypt`:
- **Administrador**:
  - Usuario: `admin` (o `admin.social@quilpue.cl`)
  - Contraseña: `Admin123!`
  - Rol: `ADMIN` (acceso a Dashboard, Beneficiarios, Carga Excel y Reportes)
- **Operador de Terreno**:
  - Usuario: `terreno` (o `terreno.social@quilpue.cl`)
  - Contraseña: `Terreno123!`
  - Rol: `FIELD_AGENT` (acceso a Búsqueda por RUT, Entrega y Captura de Actas)

---

### 4. Iniciar la Aplicación

Para trabajar en desarrollo, abre dos terminales:

#### Terminal 1 - Backend:
```bash
npm run dev:backend
```
El servidor backend iniciará en **http://localhost:3000**.

#### Terminal 2 - Frontend:
```bash
npm run dev:frontend
```
El frontend Vite iniciará en **http://localhost:5173**.

> 💡 **Nota sobre el Proxy:** `vite.config.js` reenvía automáticamente todas las solicitudes `/api`, `/apis` y `/fotoss` hacia `http://localhost:3000`, evitando problemas de CORS.

---

## 📱 Modo Offline y Resiliencia en Terreno

La aplicación cuenta con una arquitectura de alta disponibilidad:
1. **Conexión activa con el backend:** Las búsquedas por RUT, entregas con fotografía y métricas se registran en tiempo real en PostgreSQL.
2. **Sin conexión o backend apagado:** Si el funcionario se encuentra en una zona sin cobertura o el servidor está temporalmente inaccesible, el frontend conmuta automáticamente a almacenamiento local (`localStorage`) y encola las entregas para sincronización posterior.

---

## 📑 Endpoints Principales del Backend

| Método | Endpoint | Descripción | Roles Permitidos |
|---|---|---|---|
| `POST` | `/api/auth/login` | Inicio de sesión, retorna JWT token | Público |
| `GET` | `/apis/health` | Estado del backend y conteo de registros | Público |
| `GET` | `/apis/buscar?rut={rut}` | Búsqueda por RUT (apoderado o alumno) | Público / Terreno |
| `POST` | `/apis/entregas` | Registro de entrega con archivo fotográfico del acta | Terreno / Admin |
| `GET` | `/apis/kpis` | Resumen de entregas totales y gráfico por día | Admin / Terreno |
| `GET` | `/api/beneficiaries` | Listado filtrado y búsqueda de beneficiarios | Admin |
| `POST` | `/apis/upload-excel` | Importador masivo de planillas Excel (.xlsx, .xls) | Admin |
| `GET` | `/api/reports/transparency.csv` | Reporte anonimizado para Ley de Transparencia 21.180 | Admin |
| `GET` | `/fotoss/:filename` | Servidor de archivos estáticos de actas capturadas | Público |

---

## 🛠️ Tecnologías Utilizadas

- **Frontend:** React 18, Vite 5, Lucide Icons, Vite PWA, HTML5 Camera API / Canvas.
- **Backend:** Node.js, Express 4, PostgreSQL 16 (`pg`), Multer, XLSX, JSON Web Tokens (JWT), BCrypt.js.
- **Infraestructura:** Docker Compose, Nginx/Vite reverse proxy.
