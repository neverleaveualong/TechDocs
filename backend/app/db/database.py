"""SQLite feedback DB - user ratings and query logging"""

import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).parent.parent.parent / "data" / "feedback.db"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS query_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            answer TEXT NOT NULL,
            sources TEXT,
            search_mode TEXT DEFAULT 'hybrid',
            response_time_ms INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS feedbacks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_log_id INTEGER NOT NULL,
            rating INTEGER NOT NULL CHECK(rating IN (1, -1)),
            comment TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (query_log_id) REFERENCES query_logs(id)
        );

        CREATE INDEX IF NOT EXISTS idx_feedbacks_query_log_id ON feedbacks(query_log_id);
        CREATE INDEX IF NOT EXISTS idx_query_logs_created_at ON query_logs(created_at);
    """)
    conn.commit()
    conn.close()


init_db()
