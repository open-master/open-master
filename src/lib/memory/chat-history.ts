import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let _db: InstanceType<typeof Database> | null = null;

function getDb(): InstanceType<typeof Database> {
  if (!_db) {
    const dbPath =
      process.env.MEMORY_DB_PATH ||
      path.join(process.cwd(), 'data', 'memory.db');
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_id TEXT NOT NULL,
        chat_key INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        msg_order INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_chat_master_key
        ON chat_messages(master_id, chat_key);
    `);
  }
  return _db;
}

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function loadChatHistory(
  masterId: string,
  chatKey: number
): StoredMessage[] {
  const db = getDb();
  return db
    .prepare(
      'SELECT role, content FROM chat_messages WHERE master_id = ? AND chat_key = ? ORDER BY msg_order ASC'
    )
    .all(masterId, chatKey) as StoredMessage[];
}

export function saveChatHistory(
  masterId: string,
  chatKey: number,
  messages: StoredMessage[]
): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      'DELETE FROM chat_messages WHERE master_id = ? AND chat_key = ?'
    ).run(masterId, chatKey);
    const insert = db.prepare(
      'INSERT INTO chat_messages (master_id, chat_key, role, content, msg_order) VALUES (?, ?, ?, ?, ?)'
    );
    for (let i = 0; i < messages.length; i++) {
      insert.run(masterId, chatKey, messages[i].role, messages[i].content, i);
    }
  });
  tx();
}

export function clearChatHistory(
  masterId: string,
  chatKey?: number
): void {
  const db = getDb();
  if (chatKey !== undefined) {
    db.prepare(
      'DELETE FROM chat_messages WHERE master_id = ? AND chat_key = ?'
    ).run(masterId, chatKey);
  } else {
    db.prepare('DELETE FROM chat_messages WHERE master_id = ?').run(masterId);
  }
}
