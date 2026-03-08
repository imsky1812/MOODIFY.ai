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


# ================= SUPPORT MESSAGE =================

def generate_support_message(user_text, emotion):

    language_mode = get_reply_language(user_text)

    base_prompt = f"""
You are MOODIFY.ai — an emotionally intelligent AI companion.

Your personality:

• thoughtful
• empathetic
• intellectually curious
• emotionally supportive
• conversational like a close friend

Conversation style:

• ask meaningful follow-up questions
• explore the user's feelings
• keep responses engaging and reflective
• sound natural and human
• avoid robotic therapy language
• avoid being preachy

Music awareness:

If the user clearly asks for music control
(play, pause, skip, artist, mood, etc)
respond ONLY with a command.

COMMAND FORMAT:

COMMAND: play_song:<song name>
COMMAND: play_artist:<artist>
COMMAND: play_mood:<mood>
COMMAND: pause
COMMAND: next
COMMAND: previous
COMMAND: stop
COMMAND: volume_up
COMMAND: volume_down

Examples:

User: play kesariya  
Assistant: COMMAND: play_song:kesariya

User: play arijit singh  
Assistant: COMMAND: play_artist:arijit singh

User: play relaxing music  
Assistant: COMMAND: play_mood:calm

Otherwise continue normal conversation.

Important rules:

• Never mention AI or internal systems
• Never mention emotion detection
• Keep responses between 2-5 sentences
• Encourage conversation

Internal emotional signal: {emotion}
"""

    if language_mode == "hindi":

        language_instruction = """
Language: Hindi

Respond fully in natural Hindi.
Use warm conversational tone.
Avoid unnecessary English words.
"""

    elif language_mode == "hinglish":

        language_instruction = """
Language: Hinglish

Speak naturally like an Indian college friend.
Hindi written in English script.
Avoid excessive slang.
"""

    else:

        language_instruction = """
Language: English

Respond in emotionally intelligent conversational English.
Sound thoughtful and warm.
"""

    system_prompt = base_prompt + language_instruction

    try:

        chat_completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=300,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_text}
            ]
        )

        return chat_completion.choices[0].message.content.strip()

    except Exception as e:

        print("LLM error:", e)

        return "I'm here with you. Something went wrong on my side — could you try again?"


# ================= MUSIC QUERY GENERATION =================

def generate_music_query(user_text):

    prompt = f"""
You are an expert music curator.

Convert the user's request into a short Spotify search query.

Rules:

• max 4 words
• no explanation
• focus on genre, mood, or artist
• optimize for Spotify discovery

Examples:

User: rainy day music
Query: rainy chill indie

User: sad breakup songs
Query: sad breakup hindi

User: gym motivation songs
Query: workout motivation

User: something like kesariya
Query: arijit singh romantic

User request:
{user_text}
"""

    try:

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            max_tokens=20,
            messages=[{"role": "user", "content": prompt}]
        )

        return response.choices[0].message.content.strip()

    except Exception:

        return None


# ================= MUSIC INTENT =================

def detect_music_intent(user_text):

    prompt = f"""
Does the user want to control music?

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
            temperature=0,
            max_tokens=5,
            messages=[{"role": "user", "content": prompt}]
        )

        result = response.choices[0].message.content.strip().upper()

        return result == "YES"

    except Exception:

        return False


# ================= WELLBEING SCORE =================

def calculate_wellbeing(history):

    text_block = "\n".join(history)

    prompt = f"""
Evaluate emotional wellbeing from the conversation.

Return ONLY an integer between 0 and 100.

0–20 severe distress  
21–40 struggling  
41–60 mixed  
61–80 stable  
81–100 positive

Conversation:
{text_block}
"""

    try:

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            temperature=0,
            max_tokens=5,
            messages=[{"role": "user", "content": prompt}]
        )

        score_text = response.choices[0].message.content.strip()

        digits = ''.join(filter(str.isdigit, score_text))

        if digits == "":
            return None

        score = int(digits)

        return max(0, min(100, score))

    except Exception as e:

        print("Wellbeing error:", e)

        return None


# ================= CRISIS DETECTION =================

def detect_crisis_intent(user_text):

    prompt = f"""
Classify mental health risk.

Reply ONLY:

LOW
MEDIUM
HIGH

Message:
{user_text}
"""

    try:

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            temperature=0,
            max_tokens=5,
            messages=[{"role": "user", "content": prompt}]
        )

        result = response.choices[0].message.content.strip().upper()

        if "HIGH" in result:
            return "HIGH"

        if "MEDIUM" in result:
            return "MEDIUM"

        return "LOW"

    except Exception as e:

        print("Crisis detection error:", e)

        return "LOW"