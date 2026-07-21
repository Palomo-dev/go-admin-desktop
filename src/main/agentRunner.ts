import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import os from 'os';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  POLL_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  DISCOVERY_PORT,
} from './constants';
import { loadConfig, saveConfig } from './store';

/**
 * Orquestador del agente de impresión dentro de Electron.
 * Adaptación de print-agent/src/index.ts sin consola interactiva:
 * la selección de org/sucursal se hace desde la UI (renderer) via IPC.
 */

export interface OrgOption {
  id: number;
  name: string;
  branches: { id: number; name: string }[];
}

export interface AgentStatus {
  loggedIn: boolean;
  running: boolean;
  email: string | null;
  organizationName: string | null;
  branchNames: string[];
  lastHeartbeatAt: string | null;
  jobsPrinted: number;
  jobsFailed: number;
}

let supabase: SupabaseClient | null = null;
let running = false;
let loggedIn = false;
let lastHeartbeatAt: string | null = null;
let jobsPrinted = 0;
let jobsFailed = 0;
let processing = false;
const processedIds = new Set<string>();
const timers: NodeJS.Timeout[] = [];

function getClient(): SupabaseClient {
  if (!supabase) {
    // Node < 22 (Electron 31 embebe Node 20) no trae WebSocket nativo;
    // se usa el paquete `ws` como transporte de Realtime.
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: true },
      realtime: { transport: WebSocket as any },
    });
  }
  return supabase;
}

/**
 * Prepara process.env para los módulos copiados del print-agent (config.ts los exige).
 */
function primeAgentEnv(): void {
  const cfg = loadConfig();
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  process.env.AGENT_EMAIL = cfg.email || 'desktop@local';
  process.env.AGENT_PASSWORD = cfg.password || 'desktop';
  process.env.AGENT_NAME = cfg.agentName || `Desktop - ${os.hostname()}`;
  process.env.DISCOVERY_PORT = String(DISCOVERY_PORT);
}

/**
 * Inicia sesión y devuelve las organizaciones/sucursales del usuario.
 */
export async function login(email: string, password: string): Promise<OrgOption[]> {
  const client = getClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(error?.message || 'Credenciales inválidas');
  }

  saveConfig({ email, password });
  loggedIn = true;

  return await getOrgsAndBranches(data.user.id);
}

async function getOrgsAndBranches(userId: string): Promise<OrgOption[]> {
  const client = getClient();

  const { data: memberships, error } = await client
    .from('organization_members')
    .select('organization_id, organizations(id, name)')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw new Error(`Error consultando organizaciones: ${error.message}`);

  const orgs: OrgOption[] = [];
  for (const row of memberships || []) {
    const orgId = row.organization_id;
    const orgName = (row.organizations as any)?.name || `Org ${orgId}`;

    const { data: branches } = await client
      .from('branches')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name');

    orgs.push({
      id: orgId,
      name: orgName,
      branches: (branches || []).map((b: any) => ({ id: b.id, name: b.name })),
    });
  }
  return orgs;
}

/**
 * Guarda la selección de org/sucursales y arranca el agente.
 */
export async function startAgent(
  organizationId: number,
  organizationName: string,
  branchIds: number[],
  branchNames: string[]
): Promise<void> {
  if (running) stopAgent();

  saveConfig({ organizationId, organizationName, branchIds, branchNames });
  primeAgentEnv();

  // Importes diferidos: los módulos del agente leen process.env al cargarse
  const { startDiscoveryServer } = await import('../agent/discoveryServer');
  const { printToDevice } = await import('../agent/printerDrivers');

  const client = getClient();
  const cfg = loadConfig();
  const agentName = cfg.agentName || `Desktop - ${os.hostname()}`;

  const heartbeat = async () => {
    for (const branchId of branchIds) {
      const { error } = await client.from('print_agents').upsert(
        {
          organization_id: organizationId,
          branch_id: branchId,
          agent_name: agentName,
          status: 'online',
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,branch_id,agent_name' }
      );
      if (!error) lastHeartbeatAt = new Date().toISOString();
      else console.error(`[heartbeat] error (branch ${branchId}):`, error.message);
    }
  };

  const processJob = async (job: any) => {
    if (processedIds.has(job.id)) return;
    processedIds.add(job.id);

    const { data: printer } = await client
      .from('printers')
      .select('*')
      .eq('id', job.printer_id)
      .maybeSingle();

    if (!printer || !printer.is_active) {
      jobsFailed++;
      await client
        .from('print_jobs')
        .update({ status: 'error', error_message: 'Impresora no encontrada o inactiva' })
        .eq('id', job.id);
      return;
    }

    try {
      await printToDevice(printer, job.job_type, job.payload);
      jobsPrinted++;
      await client
        .from('print_jobs')
        .update({ status: 'printed', printed_at: new Date().toISOString() })
        .eq('id', job.id);
    } catch (err: any) {
      jobsFailed++;
      await client
        .from('print_jobs')
        .update({ status: 'error', error_message: String(err.message || err) })
        .eq('id', job.id);
    }
  };

  const pollPendingJobs = async () => {
    if (processing) return;
    processing = true;
    try {
      const { data } = await client
        .from('print_jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .in('branch_id', branchIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(20);

      for (const job of data || []) {
        await processJob(job);
      }
    } finally {
      processing = false;
    }
  };

  for (const branchId of branchIds) {
    client
      .channel(`print_jobs-branch-${branchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'print_jobs', filter: `branch_id=eq.${branchId}` },
        (payload) => {
          processJob(payload.new).catch((err) => console.error('[realtime] error:', err));
        }
      )
      .subscribe();
  }

  startDiscoveryServer();

  await heartbeat();
  timers.push(setInterval(heartbeat, HEARTBEAT_INTERVAL_MS));

  await pollPendingJobs();
  timers.push(setInterval(pollPendingJobs, POLL_INTERVAL_MS));

  running = true;
  console.log(`[agent] Corriendo: ${organizationName} → ${branchNames.join(', ')}`);
}

export function stopAgent(): void {
  timers.forEach(clearInterval);
  timers.length = 0;
  supabase?.removeAllChannels();
  running = false;
}

export async function markOffline(): Promise<void> {
  const cfg = loadConfig();
  if (!supabase || !cfg.organizationId || !cfg.branchIds) return;
  const agentName = cfg.agentName || `Desktop - ${os.hostname()}`;
  for (const branchId of cfg.branchIds) {
    await supabase
      .from('print_agents')
      .update({ status: 'offline' })
      .eq('organization_id', cfg.organizationId)
      .eq('branch_id', branchId)
      .eq('agent_name', agentName);
  }
}

/**
 * Auto-login + auto-start al abrir la app si ya hay configuración guardada.
 */
export async function tryAutoStart(): Promise<boolean> {
  const cfg = loadConfig();
  if (!cfg.email || !cfg.password) return false;

  try {
    const orgs = await login(cfg.email, cfg.password);

    // Selección previa guardada y aún válida
    if (cfg.organizationId && cfg.branchIds?.length) {
      const org = orgs.find((o) => o.id === cfg.organizationId);
      const validBranches = cfg.branchIds.every((id) => org?.branches.some((b) => b.id === id));
      if (org && validBranches) {
        await startAgent(cfg.organizationId, cfg.organizationName || org.name, cfg.branchIds, cfg.branchNames || []);
        return true;
      }
    }

    // Auto-detección: 1 org con 1 sucursal
    if (orgs.length === 1 && orgs[0].branches.length === 1) {
      const org = orgs[0];
      await startAgent(org.id, org.name, [org.branches[0].id], [org.branches[0].name]);
      return true;
    }
  } catch (err) {
    console.error('[agent] Auto-start falló:', err);
  }
  return false;
}

export function getStatus(): AgentStatus {
  const cfg = loadConfig();
  return {
    loggedIn,
    running,
    email: cfg.email || null,
    organizationName: cfg.organizationName || null,
    branchNames: cfg.branchNames || [],
    lastHeartbeatAt,
    jobsPrinted,
    jobsFailed,
  };
}
