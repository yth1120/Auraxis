/**
 * ssh-store.ts — SSH connection profiles (no passwords ever persisted).
 * Auth is key-file or ssh-agent only; passwords stay in memory at most.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';

export interface SshConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  keyPath?: string;
  useAgent?: boolean;
  createdAt: number;
}

function storeDir(): string {
  if (process.env.AURAXIS_SSH_DIR) return process.env.AURAXIS_SSH_DIR;
  return app.getPath('userData');
}

function storeFile(): string {
  return path.join(storeDir(), 'ssh-connections.json');
}

export async function listSshConnections(): Promise<SshConnection[]> {
  try {
    const raw = await fs.readFile(storeFile(), 'utf8');
    const parsed = JSON.parse(raw) as { connections?: SshConnection[] };
    return Array.isArray(parsed.connections) ? parsed.connections : [];
  } catch {
    return [];
  }
}

export async function saveSshConnection(conn: SshConnection): Promise<SshConnection[]> {
  const list = await listSshConnections();
  const idx = list.findIndex((c) => c.id === conn.id);
  if (idx >= 0) list[idx] = conn;
  else list.push(conn);
  await fs.mkdir(storeDir(), { recursive: true });
  await fs.writeFile(storeFile(), JSON.stringify({ connections: list }, null, 2), 'utf8');
  return list;
}

export async function removeSshConnection(id: string): Promise<SshConnection[]> {
  const list = (await listSshConnections()).filter((c) => c.id !== id);
  await fs.writeFile(storeFile(), JSON.stringify({ connections: list }, null, 2), 'utf8');
  return list;
}
