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

/**
 * Marca cada archivo copiado como generado.
 *
 * Motivo: este directorio se borra y se regenera en cada build. Editarlo
 * directamente hace que los cambios se pierdan de forma silenciosa en el
 * siguiente `npm run build`, sin ningún error visible. Ya ocurrio una vez con
 * htmlFormatter.ts y printerDrivers.ts.
 */
const BANNER = [
  '// ============================================================',
  '// ARCHIVO GENERADO AUTOMATICAMENTE - NO EDITAR',
  '//',
  '// Copiado por scripts/sync-agent.js desde:',
  `//   ${SOURCE}`,
  '//',
  '// Cualquier cambio hecho aqui SE PERDERA en el siguiente build.',
  '// Edita el archivo original en el repo del ERP (print-agent/src).',
  '// ============================================================',
  '',
].join('\n');

let stamped = 0;

// Recursivo: el agente tiene subcarpetas (printing/), y sus archivos son tan
// generados como los de la raiz.
function stampDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      stampDir(full);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      fs.writeFileSync(full, BANNER + fs.readFileSync(full, 'utf8'));
      stamped++;
    }
  }
}

stampDir(DEST);

console.log(`[sync-agent] Código del agente copiado desde print-agent/src → src/agent (${stamped} archivos marcados como generados)`);
