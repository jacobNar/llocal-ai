import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

export interface Conversation {
    id: string;
    title: string;
    created_at: number;
}

export interface Message {
    id: number;
    conversation_id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    created_at: number;
}

export class DatabaseService {
    private db: Database.Database;

    constructor() {
        const userDataPath = app.getPath('userData');
        const dbPath = path.join(userDataPath, 'vectors.db');

        // Ensure directory exists (though userData usually does)
        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }

        console.log(`Initializing database at: ${dbPath}`);
        this.db = new Database(dbPath);

        // Load sqlite-vec extension
        try {
            if (sqliteVec && typeof sqliteVec.load === 'function') {
                sqliteVec.load(this.db);
                console.log('sqlite-vec extension loaded successfully.');
            } else {
                console.warn('sqlite-vec load function not found. Vector operations may not work.');
            }
        } catch (err) {
            console.error('Failed to load sqlite-vec extension:', err);
        }

        this.initTables();
    }

    private initTables() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER
      );
    `);

        this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT,
        role TEXT,
        content TEXT,
        created_at INTEGER,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id)
      );
    `);

        // Index for faster queries by conversation
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
      ON messages(conversation_id);
    `);
    }

    createConversation(title: string = 'New Conversation'): string {
        const id = require('crypto').randomUUID();
        const stmt = this.db.prepare('INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)');
        stmt.run(id, title, Date.now());
        return id;
    }

    addMessage(conversationId: string, role: 'user' | 'assistant' | 'system' | 'tool', content: string) {
        const stmt = this.db.prepare('INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)');
        stmt.run(conversationId, role, content, Date.now());
    }

    getConversations(): Conversation[] {
        const stmt = this.db.prepare('SELECT * FROM conversations ORDER BY created_at DESC');
        return stmt.all() as Conversation[];
    }

    getMessages(conversationId: string): Message[] {
        const stmt = this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC');
        return stmt.all(conversationId) as Message[];
    }

    getConversation(conversationId: string): Conversation | undefined {
        const stmt = this.db.prepare('SELECT * FROM conversations WHERE id = ?');
        return stmt.get(conversationId) as Conversation | undefined;
    }

    updateConversationTitle(conversationId: string, title: string) {
        const stmt = this.db.prepare('UPDATE conversations SET title = ? WHERE id = ?');
        stmt.run(title, conversationId);
    }
}
