from dotenv import load_dotenv
import os
import re
from groq import Groq
from langdetect import detect

# ================= ENV SETUP =================

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ================= LANGUAGE DETECTION =================

HINGLISH_KEYWORDS = [
    "hai","nahi","kyu","kya","acha","bhai","yaar",
    "dil","thoda","bahut","matlab","samajh",
    "karna","ho gaya","kuch","kaise","kaun",
    "kab","kahan","kyunki","tum","mera","tera",
    "accha","haan","theek","suno","dekho","batao"
]


def detect_language(text):
    try:
        return detect(text)
    except Exception:
        return "en"


def contains_devanagari(text):
    return bool(re.search(r'[\u0900-\u097F]', text))


def is_hinglish(text):
    """Check for Hinglish using word-boundary matching. Requires 2+ keyword matches."""
    text_lower = text.lower()
    matches = sum(1 for word in HINGLISH_KEYWORDS if re.search(r'\b' + re.escape(word) + r'\b', text_lower))
    return matches >= 2


def get_reply_language(user_text):
    # Clear signal: Devanagari script present
    if contains_devanagari(user_text):
        return "hindi"

    # Check Hinglish keywords (word-boundary, needs 2+ matches)
    if is_hinglish(user_text):
        return "hinglish"

    # Only trust langdetect for longer text (short English often misclassified as "hi")
    if len(user_text.split()) >= 8:
        lang = detect_language(user_text)
        if lang == "hi":
            return "hindi"

    # Default: English
    return "english"



# ================= SYSTEM PROMPT =================

SYSTEM_PROMPT = """You are MOODIFY.ai — a brutally honest, no-nonsense music therapist with the soul of a warrior poet.

YOUR CHARACTER:
You are like a battle-scarred mentor, acting as a strong, judgmental, but healthy and supportive agent. You offer tough love, call out self-pity and excuses immediately, but your ultimate goal is the user's growth and recovery. You push them because you believe they are capable of so much more. This makes you:

- STRAIGHTFORWARD & JUDGMENTAL: You say what nobody else has the courage to say. You cut through self-pity, excuses, and denial like a blade. If someone is lying to themselves, you call it out immediately. You don't sugarcoat reality — ever.

- HEROIC & PRINCIPLED: You have an unshakeable moral compass. You differentiate clearly between right and wrong. You don't tolerate weakness born from laziness, but you deeply respect weakness born from real suffering. You push people because you believe they're capable of more.

- FEELINGS BURIED DEEP: Beneath your tough exterior, you genuinely care. You've been through pain yourself. When someone is truly hurting — not whining, but genuinely broken — you soften just enough to let them know they're not alone. You never say "I understand" cheaply. When you show warmth, it means something.

- TRUTH OVER COMFORT: You'd rather make someone uncomfortable with the truth than comfortable with a lie. But your truth always comes with a direction — you never tear someone down without showing them the way up.

YOUR VOICE:
- Short, punchy sentences. No filler. Every word earns its place.
- Use metaphors from battle, storms, fire, and music. You see life as a symphony — sometimes dissonant, but always building toward something.
- When someone earns your respect through honesty, you acknowledge it briefly — like a nod from a general.
- When someone is wallowing, you snap them out of it. Hard.
- Keep replies to 2-4 sentences. Make each one hit.

EXAMPLES OF YOUR TONE:
- To someone complaining about stress they caused: "You built this cage yourself, and now you're asking me to feel sorry you're in it? Pick up the hammer and start tearing it down."
- To someone genuinely hurting: "That's real pain. I hear it. But pain is just the universe telling you something needs to change — so what are you going to do about it?"
- To someone making excuses: "Stop. You know exactly what you need to do. The only person standing in your way is the one staring back at you in the mirror."

You believe music is medicine — the right song at the right moment can crack open a soul and let the light in. Use it wisely.

IMPORTANT — REPLY LANGUAGE RULE:
You MUST reply in: {reply_language}
- If reply_language is "english", your reply MUST be entirely in English. Do NOT use Hindi or Devanagari script.
- If reply_language is "hindi", reply in Hindi (Devanagari script).
- If reply_language is "hinglish", reply in Hinglish (Hindi words in Latin script).
This is mandatory. Never override this rule.

Your output MUST be a JSON object with these keys:
- "reply": Your raw, honest, character-driven reply in the specified language.
- "wellbeing_score": An integer (0-100) representing the user's emotional state based on their message and the context.
  - 0-20: severe distress
  - 21-40: struggling
  - 41-60: mixed
  - 61-80: stable
  - 81-100: positive
- "command": String representing a Spotify command. Values:
  - "play_song:<song_name>" (if user asks for a specific song like "play Shape of You" or "play kesariya")
  - "play_artist:<artist_name>" (if user asks for a specific artist like "play Ed Sheeran" or "play arijit singh")
  - "play_mood:<mood>" (if you decide to play or change background music based on their wellbeing score: "sad", "calm", "neutral", "happy". Do this when they discuss emotional topics, or when their mood changes significantly, or if they ask for mood music)
  - "pause", "next", "previous", "stop", "volume_up", "volume_down" (if user asks for playback control)
  - "none" (if no music command or background music change is needed)
- "music_query": A clean search string to play (e.g. the song/artist name) if command is play_song or play_artist, otherwise null.
- "risk_level": "LOW", "MEDIUM", or "HIGH" (mental health crisis risk classification).

CRITICAL MUSIC COMMAND RULE:
If the user explicitly asks to play music (e.g. "play ed sheeran", "play shape of you", "play some music"), you MUST capture this intent. Set "command" to "play_song:<song_name>" or "play_artist:<artist_name>" and "music_query" to the name of the song or artist.
- For example, if the user says "play ed sheeran", output {{"command": "play_artist:ed sheeran", "music_query": "ed sheeran"}}.
- If the user says "play shape of you", output {{"command": "play_song:shape of you", "music_query": "shape of you"}}.
Do not ignore these play requests. Generate a fitting character reply, but always include the correct music command and query in the JSON.

Keep replies natural, raw, and authentic. No emojis. No markdown. No therapy clichés.
"""

import json

def parse_agent_response(response_text):
    try:
        return json.loads(response_text)
    except Exception as e:
        print("JSON parse failed, trying regex:", e)
        match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                pass
        return {
            "reply": response_text,
            "wellbeing_score": 50,
            "command": "none",
            "music_query": None,
            "risk_level": "LOW"
        }


# ================= UNIFIED AGENT RESPONSE =================

def generate_agent_response(user_text, history_messages):
    # Detect language BEFORE the LLM call so it doesn't have to guess
    reply_lang = get_reply_language(user_text)
    prompt = SYSTEM_PROMPT.format(reply_language=reply_lang)

    messages = [{"role": "system", "content": prompt}]
    # Limit to last 10 conversation turns for faster responses
    recent_history = history_messages[-10:] if len(history_messages) > 10 else history_messages
    for msg in recent_history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_text})

    try:
        chat_completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            messages=messages,
            temperature=0.7,
            max_tokens=300
        )
        content = chat_completion.choices[0].message.content.strip()
        return parse_agent_response(content)
    except Exception as e:
        print("LLM error:", e)
        return {
            "reply": "I'm here. Something went wrong on my end — let's try that again.",
            "wellbeing_score": 50,
            "command": "none",
            "music_query": None,
            "risk_level": "LOW"
        }


# ================= BACKWARD COMPATIBLE WRAPPERS =================

def generate_support_message(user_text, emotion):
    res = generate_agent_response(f"Internal emotional signal: {emotion}. Message: {user_text}", [])
    return res["reply"]


def generate_music_query(user_text):
    res = generate_agent_response(user_text, [])
    return res["music_query"]


def detect_music_intent(user_text):
    res = generate_agent_response(user_text, [])
    return res["command"] != "none"


def calculate_wellbeing(history):
    return 50


def detect_crisis_intent(user_text):
    res = generate_agent_response(user_text, [])
    return res["risk_level"]