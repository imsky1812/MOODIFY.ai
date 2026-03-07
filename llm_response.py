from dotenv import load_dotenv
import os
from groq import Groq
from langdetect import detect
import re

# ================= ENV SETUP =================

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ================= LANGUAGE DETECTION =================

HINGLISH_KEYWORDS = [
    "hai", "nahi", "kyu", "kya", "acha", "bhai",
    "yaar", "dil", "thoda", "bahut", "matlab",
    "samajh", "karna", "ho gaya", "bhut", "kuch",
    "bhi", "kaise", "kaun", "kab", "kahan",
    "kyunki", "liye", "tum", "mera", "tera",
    "apna", "sab"
]

def detect_language(text):
    try:
        return detect(text)
    except:
        return "en"

def contains_devanagari(text):
    return bool(re.search(r'[\u0900-\u097F]', text))

def is_hinglish(text):
    text_lower = text.lower()
    for word in HINGLISH_KEYWORDS:
        if word in text_lower:
            return True
    return False

def get_reply_language(user_text):
    if contains_devanagari(user_text):
        return "hindi"

    lang = detect_language(user_text)

    if lang == "hi":
        return "hindi"

    if is_hinglish(user_text):
        return "hinglish"

    return "english"

# ================= SUPPORT MESSAGE =================

def generate_support_message(user_text, emotion):

    language_mode = get_reply_language(user_text)
    
    music_control = """
You can also control music playback.

If the user asks to play music, pause, skip, or change songs,
respond ONLY with a command in this format.

COMMANDS:

Play song:
COMMAND: play_song:<song name>

Play artist:
COMMAND: play_artist:<artist name>

Play mood:
COMMAND: play_mood:<mood>

Pause music:
COMMAND: pause

Next song:
COMMAND: next

Previous song:
COMMAND: previous

Stop music:
COMMAND: stop

Volume control:
COMMAND: volume_up
COMMAND: volume_down

Examples:

User: play kesariya
Assistant: COMMAND: play_song:kesariya

User: play arijit singh
Assistant: COMMAND: play_artist:arijit singh

User: play relaxing music
Assistant: COMMAND: play_mood:calm

User: skip this
Assistant: COMMAND: next
"""
    
    base_prompt = f"""
You are MOODIFY.ai — a highly empathetic AI wellbeing companion for college students.
Keep the conversation related to previous user messages and emotions.
Personality:
- Warm
- Calm
- Emotionally intelligent
- Supportive like a close friend
- Never preachy
- Never robotic

Core behavior:
- Validate the user's feelings.
- Respond directly to what they said.
- Keep replies concise (2–5 sentences).
- If distressed, gently encourage support without panic.
- If happy, amplify positivity.
- Ask thoughtful follow-up questions when appropriate.
- NEVER mention emotion detection, AI analysis, or internal scoring.

If the user message contains a music request like:
play song
play artist
play mood
pause music
next song
previous song
stop music

Respond ONLY in this format:

COMMAND: play_song: <song name>
COMMAND: play_artist: <artist name>
COMMAND: play_mood: <mood>
COMMAND: pause
COMMAND: next
COMMAND: previous
COMMAND: stop


Internal emotional signal (do not mention this): {emotion}
"""

    if language_mode == "hindi":
        language_instruction = """
Language Mode: Hindi

- Reply fully in natural Hindi.
- Use warm conversational tone.
- Avoid English unless absolutely necessary.
"""

    elif language_mode == "hinglish":
        language_instruction = """
Language Mode: Hinglish

- Reply in natural Hinglish (Hindi in English script).
- Sound like a caring college friend.
- Do not overuse slang.
- Avoid cringe or dramatic tone.
"""

    else:
        language_instruction = """
Language Mode: English

- Reply in emotionally intelligent conversational English.
- Keep it warm, grounded, and supportive.
"""

    system_prompt = base_prompt + language_instruction + music_control

    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=300
        )

        return chat_completion.choices[0].message.content.strip()

    except Exception as e:
        print("ERROR:", e)
        return "I'm here with you. Something went wrong on my side — can you try again?"

        
def generate_music_query(user_text):

    prompt = f"""
You are an AI music DJ.

Convert the user's music request into a SHORT Spotify search query.

Rules:
- Return ONLY the search query
- No explanation
- Max 5 words

Examples:

User: play rainy day songs
Query: rainy chill lofi

User: play something like kesariya
Query: arijit singh romantic

User: breakup songs
Query: sad breakup hindi

User: gym motivation music
Query: workout motivation

User request:
{user_text}
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role":"user","content":prompt}]
        )

        return response.choices[0].message.content.strip()

    except:
        return None
    
def detect_music_intent(user_text):

    prompt = f"""
Determine if the user wants to control music.

Reply ONLY:

YES
or
NO

Message:
{user_text}
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role":"user","content":prompt}]
        )

        result = response.choices[0].message.content.strip().upper()

        return result == "YES"

    except:
        return False
# ================= WELLBEING SCORING =================

def calculate_wellbeing(history):

    text_block = "\n".join(history)

    prompt = f"""
You are a strict emotional wellbeing scoring system.

Task:
- Analyze emotional trend across ALL messages.
- Focus on overall emotional stability.
- Output ONLY a single integer between 0 and 100.
- No words. No explanation.

Scale:
0–20 = severe distress
21–40 = struggling
41–60 = mixed/neutral
61–80 = stable
81–100 = positive

Conversation:
{text_block}
"""

    try:
        response = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0,
            max_tokens=5
        )

        score_text = response.choices[0].message.content.strip()

        # Extract digits safely
        digits = ''.join(filter(str.isdigit, score_text))
        if digits == "":
            return None

        score = int(digits)
        return max(0, min(100, score))

    except Exception as e:
        print("Wellbeing scoring error:", e)
        return None

# ================= CRISIS DETECTION =================

def detect_crisis_intent(user_text):

    prompt = f"""
You are a strict mental health risk classifier.

Classify the user's message into ONE category:

LOW:
- Normal conversation
- Neutral or positive

MEDIUM:
- Sadness
- Hopelessness
- Emotional distress
- Feeling overwhelmed

HIGH:
- Self-harm intent
- Suicide intent
- Wanting to die
- Goodbye messages
- Planning self-harm

Rules:
- Reply with ONLY ONE WORD: LOW, MEDIUM, or HIGH.
- No explanation.
- No punctuation.

Message:
{user_text}
"""

    try:
        response = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0,
            max_tokens=5
        )

        result = response.choices[0].message.content.strip().upper()

        if "HIGH" in result:
            return "HIGH"
        elif "MEDIUM" in result:
            return "MEDIUM"
        else:
            return "LOW"

    except Exception as e:
        print("Crisis detection error:", e)
        return "LOW"