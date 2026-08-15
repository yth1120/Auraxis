/**
 * MemoryDatabase — long-term memory persistence for AI agent context.
 *
 * Backend selection:
 *   1. better-sqlite3 (native, fast, full-text capable) — preferred
 *   2. JSON file store (zero-dependency, always available) — fallback
 *
 * Both backends implement the identical MemoryDatabase API.
 */

import { app } from 'electron';
import path from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

// ─── Types ─────────────────────────────────────────────

export interface MemoryRecord {
  id: string;
  project_path: string;
  type: 'decision' | 'problem' | 'architecture' | 'preference' | 'progress' | 'context';
  title: string;
  content: string;
  tags: string;          // JSON string array, e.g. '["react","routing"]'
  timestamp: number;
  session_id: string | null;
  importance: number;    // 1-5
  is_active: number;     // 0 = archived/resolved, 1 = active
}

type MemoryInput = Omit<MemoryRecord, 'importance' | 'is_active'> & {
  importance?: number;
  is_active?: number;
};

// ─── SQLite backend ────────────────────────────────────

class SqliteBackend {
  private db: any;

  constructor(dbPath: string) {
    const Database = require('better-sqlite3');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('decision','problem','architecture','preference','progress','context')),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        timestamp INTEGER NOT NULL,
        session_id TEXT,
        importance INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_project_type ON memories(project_path, type);
      CREATE INDEX IF NOT EXISTS idx_project_tags ON memories(project_path, tags);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp);
    `);
  }

  addMemory(m: MemoryInput): void {
    this.db.prepare(`
      INSERT INTO memories (id, project_path, type, title, content, tags, timestamp, session_id, importance, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(m.id, m.project_path, m.type, m.title, m.content, JSON.stringify(m.tags || []),
           m.timestamp, m.session_id, m.importance ?? 0, m.is_active ?? 1);
  }

  getMemoriesByProject(projectPath: string, limit = 100): MemoryRecord[] {
    return this.db.prepare(
      'SELECT * FROM memories WHERE project_path = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(projectPath, limit).map(this.rowToMemory);
  }

  getMemoriesByType(projectPath: string, type: string): MemoryRecord[] {
    return this.db.prepare(
      'SELECT * FROM memories WHERE project_path = ? AND type = ? ORDER BY timestamp DESC'
    ).all(projectPath, type).map(this.rowToMemory);
  }

  getMemoriesByTag(projectPath: string, tag: string): MemoryRecord[] {
    return this.db.prepare(
      "SELECT * FROM memories WHERE project_path = ? AND tags LIKE ? ORDER BY timestamp DESC"
    ).all(projectPath, `%${tag}%`).map(this.rowToMemory);
  }

  searchMemories(projectPath: string, query: string): MemoryRecord[] {
    return this.db.prepare(
      "SELECT * FROM memories WHERE project_path = ? AND (title LIKE ? OR content LIKE ?) ORDER BY timestamp DESC LIMIT 50"
    ).all(projectPath, `%${query}%`, `%${query}%`).map(this.rowToMemory);
  }

  updateMemory(id: string, updates: Partial<MemoryRecord>): void {
    const fields = Object.keys(updates).filter(k => k !== 'id');
    if (fields.length === 0) return;
    // Always parameterize — interpolating tags (untrusted model text) into
    // the SQL string both broke on apostrophes and allowed injection.
    const sets = fields.map(f => `${f} = ?`);
    const values = fields.map(f => f === 'tags' ? JSON.stringify(updates[f] || []) : (updates as any)[f]);
    this.db.prepare(`UPDATE memories SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  }

  archiveMemory(id: string): void {
    this.db.prepare('UPDATE memories SET is_active = 0 WHERE id = ?').run(id);
  }

  getActiveMemories(projectPath: string): MemoryRecord[] {
    return this.db.prepare(
      'SELECT * FROM memories WHERE project_path = ? AND is_active = 1 ORDER BY importance DESC, timestamp DESC'
    ).all(projectPath).map(this.rowToMemory);
  }

  deleteMemory(id: string): void {
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  }

  private rowToMemory(row: any): MemoryRecord {
    return { ...row, tags: row.tags || '[]', importance: row.importance ?? 0, is_active: row.is_active ?? 1 };
  }
}

// ─── JSON file fallback backend ─────────────────────────

class JsonBackend {
  private filePath: string;
  private data: MemoryRecord[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load() {
    try {
      if (existsSync(this.filePath)) {
        this.data = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      }
    } catch { this.data = []; }
  }

  private save() {
    const dir = path.dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  addMemory(m: MemoryInput): void {
    this.data.push({
      ...m,
      tags: typeof m.tags === 'string' ? m.tags : JSON.stringify(m.tags || []),
      importance: m.importance ?? 0,
      is_active: m.is_active ?? 1,
    });
    this.save();
  }

  getMemoriesByProject(projectPath: string, limit = 100): MemoryRecord[] {
    return this.data
      .filter(m => m.project_path === projectPath)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getMemoriesByType(projectPath: string, type: string): MemoryRecord[] {
    return this.data
      .filter(m => m.project_path === projectPath && m.type === type)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getMemoriesByTag(projectPath: string, tag: string): MemoryRecord[] {
    return this.data
      .filter(m => m.project_path === projectPath && m.tags.includes(tag))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  searchMemories(projectPath: string, query: string): MemoryRecord[] {
    const q = query.toLowerCase();
    return this.data
      .filter(m => m.project_path === projectPath &&
        (m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q)))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
  }

  updateMemory(id: string, updates: Partial<MemoryRecord>): void {
    const idx = this.data.findIndex(m => m.id === id);
    if (idx < 0) return;
    const updated = { ...this.data[idx], ...updates };
    if (updates.tags && typeof updates.tags !== 'string') {
      updated.tags = JSON.stringify(updates.tags);
    }
    this.data[idx] = updated;
    this.save();
  }

  archiveMemory(id: string): void {
    this.updateMemory(id, { is_active: 0 });
  }

  getActiveMemories(projectPath: string): MemoryRecord[] {
    return this.data
      .filter(m => m.project_path === projectPath && m.is_active === 1)
      .sort((a, b) => b.importance - a.importance || b.timestamp - a.timestamp);
  }

  deleteMemory(id: string): void {
    this.data = this.data.filter(m => m.id !== id);
    this.save();
  }
}

// ─── Singleton factory ─────────────────────────────────

function createBackend() {
  try {
    require.resolve('better-sqlite3');
    const dbPath = path.join(app.getPath('userData'), 'auraxis-memory.db');
    return new SqliteBackend(dbPath);
  } catch {
    const dbPath = path.join(app.getPath('userData'), 'auraxis-memory.json');
    return new JsonBackend(dbPath);
  }
}

let instance: SqliteBackend | JsonBackend | null = null;

function getBackend(): SqliteBackend | JsonBackend {
  if (!instance) instance = createBackend();
  return instance;
}

// ─── Public API ─────────────────────────────────────────

export function addMemory(memory: MemoryInput): void {
  getBackend().addMemory(memory);
}

export function getMemoriesByProject(projectPath: string, limit?: number): MemoryRecord[] {
  return getBackend().getMemoriesByProject(projectPath, limit);
}

export function getMemoriesByType(projectPath: string, type: string): MemoryRecord[] {
  return getBackend().getMemoriesByType(projectPath, type);
}

export function getMemoriesByTag(projectPath: string, tag: string): MemoryRecord[] {
  return getBackend().getMemoriesByTag(projectPath, tag);
}

export function searchMemories(projectPath: string, query: string): MemoryRecord[] {
  return getBackend().searchMemories(projectPath, query);
}

export function updateMemory(id: string, updates: Partial<MemoryRecord>): void {
  getBackend().updateMemory(id, updates);
}

export function archiveMemory(id: string): void {
  getBackend().archiveMemory(id);
}

export function getActiveMemories(projectPath: string): MemoryRecord[] {
  return getBackend().getActiveMemories(projectPath);
}

export function deleteMemory(id: string): void {
  getBackend().deleteMemory(id);
}
