"""
MOODIFY.ai — Conversation Memory Manager

Maintains a fast in-memory deque for LLM context windows AND
persists every message to the SQLite database via database.py.

Memory is isolated PER USER (keyed by user_email) so concurrent users
never share conversation context or wellbeing scores. Callers that do
not provide a user_email fall back to a shared anonymous bucket.
"""

from collections import deque, defaultdict
from datetime import datetime
import threading

from database import save_chat_message, get_chat_history as db_get_history

# ================= MEMORY SETTINGS =================

# Limit conversation history to prevent memory overflow
MAX_HISTORY = 200

# Bucket used when no user_email is supplied (e.g. warmup/anonymous calls)
_ANON_KEY = "__anonymous__"

# Guards mutations of the per-user containers below
_lock = threading.Lock()

# Per-user circular memory buffers (in-memory for LLM context speed)
_user_histories = defaultdict(lambda: deque(maxlen=MAX_HISTORY))

# Per-user last wellbeing score
_user_scores = {}


def _key(user_email=None):
    return user_email or _ANON_KEY


# ================= ADD MESSAGE =================

def add_user_message(text, user_email=None, wellbeing_score=None, detected_emotion=None):
    """Store user message in conversation history and persist to DB."""

    message = {
        "role": "user",
        "text": text,
        "timestamp": datetime.utcnow()
    }

    with _lock:
        _user_histories[_key(user_email)].append(message)

    # Persist to SQLite if user is identified
    if user_email:
        try:
            save_chat_message(user_email, "user", text, wellbeing_score, detected_emotion)
        except Exception as e:
            print(f"[DB Warning] Failed to persist user message: {e}")


def add_assistant_message(text, user_email=None):
    """Store assistant message in conversation history and persist to DB."""

    message = {
        "role": "assistant",
        "text": text,
        "timestamp": datetime.utcnow()
    }

    with _lock:
        _user_histories[_key(user_email)].append(message)

    # Persist to SQLite if user is identified
    if user_email:
        try:
            save_chat_message(user_email, "assistant", text)
        except Exception as e:
            print(f"[DB Warning] Failed to persist assistant message: {e}")


# ================= GET HISTORY =================

def get_history(user_email=None):
    """Return messages formatted for the LLM API.

    If user_email is provided and in-memory is empty,
    fall back to DB for context continuity across restarts.
    """

    history = _user_histories.get(_key(user_email))
    if history and len(history) > 0:
        return [{"role": msg["role"], "content": msg["text"]} for msg in history]

    # Fall back to DB for returning users with empty in-memory buffer
    if user_email:
        try:
            db_rows = db_get_history(user_email, limit=50)
            return [{"role": r["role"], "content": r["text"]} for r in db_rows]
        except Exception as e:
            print(f"[DB Warning] Failed to load history from DB: {e}")

    return []


# ================= MESSAGE COUNT =================

def message_count(user_email=None):
    """Total stored messages for a user."""

    return len(_user_histories.get(_key(user_email), ()))


# ================= LAST N MESSAGES =================

def last_messages(n=10, user_email=None):
    """Return last N messages as role-prefixed text."""

    messages = list(_user_histories.get(_key(user_email), ()))[-n:]
    return [f"{msg['role']}: {msg['text']}" for msg in messages]


# ================= WELLBEING SCORE =================

def set_score(score, user_email=None):
    """Store last calculated wellbeing score for a user."""

    with _lock:
        _user_scores[_key(user_email)] = score


def get_score(user_email=None):
    """Retrieve last wellbeing score for a user."""

    return _user_scores.get(_key(user_email))


# ================= CLEAR MEMORY =================

def clear_memory(user_email=None):
    """Reset in-memory chat context and wellbeing score for a user."""

    key = _key(user_email)
    with _lock:
        if key in _user_histories:
            _user_histories[key].clear()
        _user_scores.pop(key, None)
