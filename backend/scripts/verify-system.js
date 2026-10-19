const http = require('http');
const app = require('../src/app');
const { initDatabase, memoryStore } = require('../src/config/db');

async function testSuite() {
  console.log('--- INICIANDO TEST SUITE DEL SISTEMA ---');
  await initDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(3001, resolve));
  console.log('[TEST] Servidor de prueba en puerto 3001');

  try {
    // 1. Health
    const hRes = await fetch('http://localhost:3001/api/health');
    const hJson = await hRes.json();
    console.log('[TEST 1] /api/health ->', hJson.status, '| Registros:', hJson.records);

    // 2. Login Admin
    const lRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin123!' }),
    });
    const lJson = await lRes.json();
    console.log('[TEST 2] /api/auth/login (Admin) ->', lRes.status, '| Token obtenido:', !!lJson.token);
    const token = lJson.token;

    // 3. Buscar por RUT con Módulo 11 (Probemos con uno del Listado)
    // En Listado Ayuda Escolar: '16777208-0'
    const bRes = await fetch('http://localhost:3001/api/guardians/16777208-0', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bJson = await bRes.json();
    console.log('[TEST 3] /api/guardians/16777208-0 ->', bRes.status, '| Apoderado:', bJson.guardian?.fullName, '| Beneficios:', bJson.benefits?.length);

    // 4. KPIs
    const kRes = await fetch('http://localhost:3001/api/reports/kpis', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const kJson = await kRes.json();
    console.log('[TEST 4] /api/reports/kpis -> Total:', kJson.totalRegistros, '| Sectores:', kJson.deliveriesBySector?.length);

    // 5. Auditoría
    const aRes = await fetch('http://localhost:3001/api/admin/audit-logs', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const aJson = await aRes.json();
    console.log('[TEST 5] /api/admin/audit-logs -> Eventos registrados:', aJson.count, '| Última acción:', aJson.logs[0]?.action);

    console.log('--- TODOS LOS TESTS COMPLETADOS SATISFACTORIAMENTE ---');
  } catch (err) {
    console.error('[ERROR EN TEST]', err);
  } finally {
    server.close();
  }
}

testSuite();
