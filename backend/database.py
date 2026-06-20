"""
MOODIFY.ai — SQLite Persistent Database Layer

Provides thread-safe SQLite connections, table initialization, and CRUD
operations for users, chat history, meditation sessions, and community posts.
"""

import sqlite3
import os
import threading
from datetime import datetime, timedelta
import random

# ================= DATABASE PATH =================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "..", "moodify.db")

# Thread-local storage for SQLite connections (one per thread)
_local = threading.local()


# ================= CONNECTION =================

def get_connection() -> sqlite3.Connection:
    """Return a thread-local SQLite connection with WAL mode for concurrency."""
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL;")
        _local.conn.execute("PRAGMA foreign_keys=ON;")
    return _local.conn


# ================= SCHEMA INIT =================

def init_db():
    """Create all tables if they don't exist."""
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            picture TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            wellbeing_score INTEGER,
            detected_emotion TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_email) REFERENCES users(email)
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            session_type TEXT NOT NULL,
            duration_seconds INTEGER NOT NULL,
            wellbeing_before INTEGER,
            wellbeing_after INTEGER,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_email) REFERENCES users(email)
        );

        CREATE TABLE IF NOT EXISTS community_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            alias TEXT NOT NULL,
            content TEXT NOT NULL,
            mood_tag TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_email) REFERENCES users(email)
        );
    """)
    conn.commit()
    print("[DB] SQLite database initialized at", DB_PATH)


# ================= USERS =================

def upsert_user(email: str, name: str, picture: str = ""):
    """Insert or update user profile on login."""
    conn = get_connection()
    conn.execute(
        """INSERT INTO users (email, name, picture) VALUES (?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET name=excluded.name, picture=excluded.picture""",
        (email, name, picture),
    )
    conn.commit()


# ================= CHAT HISTORY =================

def save_chat_message(
    user_email: str,
    role: str,
    text: str,
    wellbeing_score: int = None,
    detected_emotion: str = None,
):
    """Persist a single chat message to the database."""
    conn = get_connection()
    conn.execute(
        """INSERT INTO chat_history (user_email, role, text, wellbeing_score, detected_emotion)
           VALUES (?, ?, ?, ?, ?)""",
        (user_email, role, text, wellbeing_score, detected_emotion),
    )
    conn.commit()


def get_chat_history(user_email: str, limit: int = 200):
    """Retrieve the last `limit` chat messages for a user."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT role, text, wellbeing_score, detected_emotion, timestamp
           FROM chat_history WHERE user_email = ? ORDER BY id DESC LIMIT ?""",
        (user_email, limit),
    ).fetchall()
    # Return oldest-first
    return [dict(r) for r in reversed(rows)]


def get_mood_logs(user_email: str, limit: int = 100):
    """Retrieve user messages with wellbeing scores and emotions for the Mood Log view."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT text, wellbeing_score, detected_emotion, timestamp
           FROM chat_history
           WHERE user_email = ? AND role = 'user'
           ORDER BY id DESC LIMIT ?""",
        (user_email, limit),
    ).fetchall()
    return [dict(r) for r in reversed(rows)]


def get_analytics_data(user_email: str, days: int = 30):
    """Aggregate wellbeing scores by day for the analytics chart."""
    conn = get_connection()
    since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d 00:00:00")
    rows = conn.execute(
        """SELECT DATE(timestamp) as day, ROUND(AVG(wellbeing_score)) as avg_score,
                  COUNT(*) as msg_count
           FROM chat_history
           WHERE user_email = ? AND wellbeing_score IS NOT NULL AND timestamp >= ?
           GROUP BY DATE(timestamp)
           ORDER BY day ASC""",
        (user_email, since),
    ).fetchall()
    return [dict(r) for r in rows]


# ================= SESSIONS =================

def log_session(
    user_email: str,
    session_type: str,
    duration_seconds: int,
    wellbeing_before: int = None,
    wellbeing_after: int = None,
):
    """Record a completed meditation/breathing session."""
    conn = get_connection()
    conn.execute(
        """INSERT INTO sessions (user_email, session_type, duration_seconds, wellbeing_before, wellbeing_after)
           VALUES (?, ?, ?, ?, ?)""",
        (user_email, session_type, duration_seconds, wellbeing_before, wellbeing_after),
    )
    conn.commit()


def get_user_sessions(user_email: str, limit: int = 50):
    """Retrieve past meditation sessions for a user."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT session_type, duration_seconds, wellbeing_before, wellbeing_after, timestamp
           FROM sessions WHERE user_email = ? ORDER BY id DESC LIMIT ?""",
        (user_email, limit),
    ).fetchall()
    return [dict(r) for r in reversed(rows)]


# ================= COMMUNITY =================

_ADJECTIVES = [
    "Serene", "Calm", "Gentle", "Quiet", "Peaceful", "Radiant", "Bright",
    "Steady", "Warm", "Misty", "Crystal", "Silent", "Golden", "Lunar",
    "Cosmic", "Velvet", "Amber", "Ivory", "Azure", "Ember",
]

_NOUNS = [
    "Wave", "Forest", "River", "Cloud", "Star", "Breeze", "Meadow",
    "Mountain", "Ocean", "Flame", "Petal", "Horizon", "Echo", "Phoenix",
    "Aurora", "Glacier", "Storm", "Whisper", "Dream", "Tide",
]


def _generate_alias() -> str:
    """Generate a random anonymous alias like 'Serene Wave'."""
    return f"{random.choice(_ADJECTIVES)} {random.choice(_NOUNS)}"


def create_community_post(user_email: str, content: str, mood_tag: str = None):
    """Create a new anonymous community post."""
    alias = _generate_alias()
    conn = get_connection()
    conn.execute(
        """INSERT INTO community_posts (user_email, alias, content, mood_tag)
           VALUES (?, ?, ?, ?)""",
        (user_email, alias, content, mood_tag),
    )
    conn.commit()
    return alias


def get_community_posts(limit: int = 50):
    """Retrieve the latest community posts (public, anonymous)."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT alias, content, mood_tag, timestamp
           FROM community_posts ORDER BY id DESC LIMIT ?""",
        (limit,),
    ).fetchall()
    return [dict(r) for r in reversed(rows)]
