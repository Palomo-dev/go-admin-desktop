# Go Admin Desktop

App de escritorio (Electron) de **GO Admin ERP**. Conecta las impresoras físicas del local (POS/PMS) con la nube, con interfaz gráfica, icono en la bandeja del sistema y arranque automático con Windows.

Es la evolución del `print-agent` de consola: **usa exactamente el mismo código del agente** (se sincroniza desde `../print-agent/src`), envuelto en una app instalable.

## Características

- Ventana de login (email + contraseña de GO Admin)
- Detección automática de organización/sucursal (menú si hay varias)
- Estado de conexión, contadores de trabajos impresos/errores
- Lista de impresoras del sistema detectadas
- Minimiza a la bandeja del sistema (cerrar la ventana no detiene el agente)
- Arranque automático con Windows (checkbox en la UI)
- Instalador `.exe` (NSIS) con electron-builder

## Desarrollo

```bash
cd go-admin-desktop
npm install
npm start          # sincroniza agente + compila + abre Electron
```

> **Antes de compilar**: editar `src/main/constants.ts` y pegar la `SUPABASE_ANON_KEY`.

### Sincronizar el código del agente

El código de impresión vive en `../print-agent/src` (fuente única de verdad). Para traer la última versión:

```bash
npm run sync-agent
```

Esto copia todo a `src/agent/` (excepto `index.ts`, que es reemplazado por `src/main/agentRunner.ts`).

## Generar instalador

```bash
npm run dist       # genera release/GoAdminDesktop-Setup-x.x.x.exe
```

Requiere `build/icon.ico` (icono de la app, 256x256).

## Arquitectura

```
src/
├── main/               Proceso principal (Node)
│   ├── index.ts        Ciclo de vida, ventana, instancia única
│   ├── agentRunner.ts  Orquestador del agente (login, realtime, polling, heartbeat)
│   ├── tray.ts         Icono en bandeja del sistema
│   ├── autostart.ts    Arranque con Windows (registro nativo)
│   ├── ipc.ts          Handlers expuestos a la UI
│   ├── store.ts        Config persistente (userData/config.json)
│   └── constants.ts    URL/anon key de Supabase, intervalos
├── preload/
│   └── index.ts        Bridge seguro → window.goAdminDesktop
├── renderer/
│   └── index.html      UI: login, selección de sucursal, estado
└── agent/              COPIADO de print-agent/src (npm run sync-agent)
    ├── agentSetup.ts, discoveryServer.ts, printerDrivers.ts,
    ├── escposFormatter.ts, supabaseClient.ts, config.ts, types.ts
```

## Flujo del usuario final

```
Instala GoAdminDesktop-Setup.exe → Siguiente → Finalizar
  → Abre la app → ingresa email/contraseña de GO Admin
  → 1 org + 1 sucursal: arranca solo | varias: selecciona en la UI
  → La selección queda guardada; próximos arranques son automáticos
  → Icono en bandeja: la app sigue corriendo aunque cierres la ventana
  → En la web (Configuración → Impresoras) aparece "En línea"
```

## Roadmap

- **v1** (este proyecto): agente de impresión con GUI
- **v2**: cargar el módulo POS (`app.goadmin.io/app/pos`) en un BrowserWindow con bridge nativo
- **v3**: módulo PMS + auto-update con GitHub Releases

Ver `../docs/GO_ADMIN_DESKTOP.md` para la arquitectura completa.
