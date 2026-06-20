"""
MOODIFY.ai — Conversation Memory Manager

Maintains a fast in-memory deque for LLM context windows AND
persists every message to the SQLite database via database.py.
All functions accept an optional `user_email` parameter for per-user storage.
"""

from collections import deque
from datetime import datetime

from database import save_chat_message, get_chat_history as db_get_history

# ================= MEMORY SETTINGS =================

# Limit conversation history to prevent memory overflow
MAX_HISTORY = 200

# Thread-safe circular memory buffer (in-memory for LLM context speed)
conversation_history = deque(maxlen=MAX_HISTORY)

# Last wellbeing score
last_score = None


# ================= ADD MESSAGE =================

def add_user_message(text, user_email=None, wellbeing_score=None, detected_emotion=None):
    """Store user message in conversation history and persist to DB."""
    
    message = {
        "role": "user",
        "text": text,
        "timestamp": datetime.utcnow()
    }

    conversation_history.append(message)

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

    conversation_history.append(message)

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
    
    if len(conversation_history) > 0:
        return [{"role": msg["role"], "content": msg["text"]} for msg in conversation_history]
    
    # Fall back to DB for returning users with empty in-memory buffer
    if user_email:
        try:
            db_rows = db_get_history(user_email, limit=50)
            return [{"role": r["role"], "content": r["text"]} for r in db_rows]
        except Exception as e:
            print(f"[DB Warning] Failed to load history from DB: {e}")
    
    return []


# ================= MESSAGE COUNT =================

def message_count():
    """Total stored messages."""
    
    return len(conversation_history)


# ================= LAST N MESSAGES =================

def last_messages(n=10):
    """Return last N messages as role-prefixed text."""
    
    messages = list(conversation_history)[-n:]
    return [f"{msg['role']}: {msg['text']}" for msg in messages]


# ================= WELLBEING SCORE =================

def set_score(score):
    """Store last calculated wellbeing score."""
    
    global last_score
    last_score = score


def get_score():
    """Retrieve last wellbeing score."""
    
    return last_score