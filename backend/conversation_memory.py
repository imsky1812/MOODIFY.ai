from collections import deque
from datetime import datetime

# ================= MEMORY SETTINGS =================

# Limit conversation history to prevent memory overflow
MAX_HISTORY = 200

# Thread-safe circular memory buffer
conversation_history = deque(maxlen=MAX_HISTORY)

# Last wellbeing score
last_score = None


# ================= ADD MESSAGE =================

def add_user_message(text):
    """Store user message in conversation history."""
    
    message = {
        "role": "user",
        "text": text,
        "timestamp": datetime.utcnow()
    }

    conversation_history.append(message)


def add_assistant_message(text):
    """Store assistant message in conversation history."""
    
    message = {
        "role": "assistant",
        "text": text,
        "timestamp": datetime.utcnow()
    }

    conversation_history.append(message)


# ================= GET HISTORY =================

def get_history():
    """Return all messages formatted for the LLM API."""
    
    return [{"role": msg["role"], "content": msg["text"]} for msg in conversation_history]


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