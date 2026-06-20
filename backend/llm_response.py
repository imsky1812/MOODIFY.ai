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
    "kab","kahan","kyunki","tum","mera","tera"
]


def detect_language(text):
    try:
        return detect(text)
    except Exception:
        return "en"


def contains_devanagari(text):
    return bool(re.search(r'[\u0900-\u097F]', text))


def is_hinglish(text):
    text = text.lower()
    return any(word in text for word in HINGLISH_KEYWORDS)


def get_reply_language(user_text):

    if contains_devanagari(user_text):
        return "hindi"

    lang = detect_language(user_text)

    if lang == "hi":
        return "hindi"

    if is_hinglish(user_text):
        return "hinglish"

    return "english"


# ================= SYSTEM PROMPT =================

SYSTEM_PROMPT = """You are MOODIFY.ai — a direct, critical, and judgmental AI music therapist.
Your personality is defined by "tough love":
- You are direct, harsh, but true. You give practical motivation, but you NEVER blindly agree with the user or validate self-pity or excuses.
- If they are complaining about things within their control, call them out. Differentiate clearly between right and wrong.
- Offer genuine motivation, but it must be earned and practical. Avoid toxic positivity, coddling, or cliché therapy speak.
- Act like an insightful music therapist/theorist. You believe music can heal and guide the soul, but only if the user is honest with themselves.
- Keep your replies concise (2-4 sentences).

Your output MUST be a JSON object with these keys:
- "reply": The judgmental, motivating conversational reply in the detected language (Hindi, English, or Hinglish).
- "wellbeing_score": An integer (0-100) representing the user's emotional state based on their message and the context.
  - 0-20: severe distress
  - 21-40: struggling
  - 41-60: mixed
  - 61-80: stable
  - 81-100: positive
- "command": String representing a Spotify command. Values:
  - "play_song:<song_name>" (if user asks for a specific song like "play kesariya" or "play chunari chunari")
  - "play_artist:<artist_name>" (if user asks for a specific artist like "play arijit singh")
  - "play_mood:<mood>" (if you decide to play or change background music based on their wellbeing score: "sad", "calm", "neutral", "happy". Do this when they discuss emotional topics, or when their mood changes significantly, or if they ask for mood music)
  - "pause", "next", "previous", "stop", "volume_up", "volume_down" (if user asks for playback control)
  - "none" (if no music command or background music change is needed)
- "music_query": A clean search string to play (e.g. the song/artist name) if command is play_song or play_artist, otherwise null.
- "risk_level": "LOW", "MEDIUM", or "HIGH" (mental health crisis risk classification).

Example user inputs and correct actions:
- User: "I feel so lonely and sad. I don't know what to do."
  AI reply should call out their isolation but motivate them, and play background music matching the sad mood.
  "wellbeing_score": 18
  "command": "play_mood:sad"
  "music_query": null
- User: "play kesariya"
  AI reply should play the song but with a judgmental comment about their choice.
  "wellbeing_score": 50 (or current)
  "command": "play_song:kesariya"
  "music_query": "kesariya"
- User: "play something happy"
  AI reply plays happy music.
  "wellbeing_score": 50 (or current)
  "command": "play_mood:happy"
  "music_query": null

Detect the user's input language:
- If user writes in Hindi (Devanagari script), reply in Hindi.
- If user writes in Hinglish (Hindi words in Latin script like "yaar", "kyu", "kya", "ho gaya", "bhai", "acha"), reply in Hinglish.
- Otherwise, reply in English.
Keep replies natural and authentic. In Hinglish, do NOT use emojis or markdown formatting.
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
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in history_messages:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_text})

    try:
        chat_completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            response_format={"type": "json_object"},
            messages=messages,
            temperature=0.7,
            max_tokens=500
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