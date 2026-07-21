/**
 * Copia el código del print-agent (fuente única de verdad) hacia src/agent.
 * Así el agente se mantiene en un solo lugar y Desktop siempre usa la última versión.
 *
 * Uso: npm run sync-agent
 */
const fs = require('fs');
const path = require('path');

// Ruta al código fuente del print-agent. Se puede sobrescribir con la
// variable de entorno PRINT_AGENT_SRC si el repo del ERP está en otra ubicación.
const CANDIDATES = [
  process.env.PRINT_AGENT_SRC,
  path.join(__dirname, '..', '..', 'print-agent', 'src'), // si está dentro del repo del ERP
  'C:\\Users\\USUARIO\\CascadeProjects\\go-admin-erp\\print-agent\\src', // ubicación conocida del repo del ERP
].filter(Boolean);

const SOURCE = CANDIDATES.find((p) => fs.existsSync(p));
const DEST = path.join(__dirname, '..', 'src', 'agent');

if (!SOURCE) {
  console.error('[sync-agent] No se encontró el código del print-agent. Rutas probadas:');
  CANDIDATES.forEach((p) => console.error(`  - ${p}`));
  console.error('Define la variable de entorno PRINT_AGENT_SRC con la ruta correcta.');
  process.exit(1);
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.cpSync(SOURCE, DEST, { recursive: true });

// index.ts del agente arranca main() automáticamente — no debe ejecutarse al importar en Electron.
// Se elimina de la copia: Desktop usa su propio orquestador (src/main/agentRunner.ts).
const agentIndex = path.join(DEST, 'index.ts');
if (fs.existsSync(agentIndex)) {
  fs.rmSync(agentIndex);
}

console.log('[sync-agent] Código del agente copiado desde print-agent/src → src/agent');
