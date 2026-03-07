from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi import Request
import subprocess
import sys
from pydantic import BaseModel

from fastapi.responses import (
    FileResponse, 
    RedirectResponse,
    JSONResponse

)

from spotify_service import (
    search_track, 
    get_recommendations_by_mood, 
    sp,
    auth_manager
)


from llm_response import (
    detect_crisis_intent,
    generate_support_message,
    calculate_wellbeing,
    generate_music_query,
    detect_music_intent
)

from text_emotion import detect_text_emotion
from mental_state import calculate_stress_score
from conversation_memory import (
    add_user_message,
    get_history,
    message_count,
    set_score,
    get_score,
)

# ================= INIT =================

app = FastAPI()
app.mount("/static", StaticFiles(directory="frontend"), name="static")

voice_session_active = False


# ================= ROOT =================

@app.get("/")
def serve_ui():
    return FileResponse("frontend/index.html")


# ================= TEXT CHAT =================

class TextInput(BaseModel):
    text: str


@app.post("/analyze-text/")
def analyze_text(data: TextInput):

    user_text = data.text.strip()

    if not user_text:
        return {
            "support_message": "Tell me what's on your mind.",
            "wellbeing_score": "Calculating...",
            "risk_level": "LOW",
        }

    # 1️⃣ Detect crisis
    risk = detect_crisis_intent(user_text)

    # 2️⃣ Store message
    add_user_message(user_text)

    # 3️⃣ Generate response
    music_query = None
    
    if detect_music_intent(user_text):
        music_query = generate_music_query(user_text)
        reply = ""
    else : reply = generate_support_message(user_text, "neutral")

    command = None

    if reply.startswith("COMMAND:"):
        command = reply.replace("COMMAND:", "").strip()
        reply = "Here's something that might help."

    # 4️⃣ Wellbeing logic
    count = message_count()
    previous_score = get_score()

    if count < 7:
        wellbeing = "Calculating..."
    else:
        score = calculate_wellbeing(get_history())

        if score is not None:
            if previous_score is None:
                set_score(score)
                wellbeing = score
            else:
                # smoothing
                smooth_score = int(previous_score * 0.7 + score * 0.3)
                set_score(smooth_score)
                wellbeing = smooth_score
        else:
            wellbeing = previous_score if previous_score else "Calculating..."

    return {
        "support_message": reply,
        "music_query": music_query,
        "command": command,
        "wellbeing_score": wellbeing,
        "risk_level": risk,
    }
    


# ================= FACE SUPPORT =================

class FaceEmotionInput(BaseModel):
    emotion: str


@app.post("/face-support/")
def face_support(data: FaceEmotionInput):

    face_emotion = data.emotion

    # No text input in face mode
    text_emotion = "neutral"

    score, risk = calculate_stress_score(text_emotion, face_emotion)

    support_message = generate_support_message(
        f"I am feeling {face_emotion}",
        face_emotion
    )

    return {
        "detected_emotion": face_emotion,
        "wellbeing_score": score,
        "risk_level": risk,
        "support_message": support_message,
    }


# ================= CAMERA =================

@app.get("/start-camera")
def start_camera():
    try:
        subprocess.Popen(
            [sys.executable, "live_face_emotion.py"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"status": "camera started"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ================= VOICE =================

@app.get("/start-voice")
def start_voice():
    if not hasattr(app.state, "voice_running") or not app.state.voice_running:
        app.state.voice_running = True
        subprocess.Popen(
            [sys.executable, "voice_assistant.py"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    return {"status": "voice started"}


@app.get("/voice-cycle")
def voice_cycle():

    global voice_session_active
    voice_session_active = True

    from voice_emotion import record_audio, speech_to_text
    from ai_voice import speak

    if not voice_session_active:
        return {"text": "", "reply": ""}

    record_audio()

    if not voice_session_active:
        return {"text": "", "reply": ""}

    text = speech_to_text()

    if not text:
        return {"text": "", "reply": ""}

    emotion = detect_text_emotion(text)
    response = generate_support_message(text, emotion)


    return {
        "text": text,
        "reply": response,
    }


@app.get("/stop-voice")
def stop_voice():
    global voice_session_active
    voice_session_active = False
    return {"status": "stopped"}


# ================= SCORE ROUTES =================

@app.get("/current-score")
def current_score():

    count = message_count()
    score = get_score()

    if count == 0:
        return {"score": "Start chatting to calculate"}

    if count < 7 and score is None:
        return {"score": "Calculating..."}

    if score is not None:
        return {"score": score}

    return {"score": "Calculating..."}


@app.get("/initial-score")
def initial_score():
    return {"wellbeing_score": "Start chatting to calculate"}


# ================= WELCOME =================

@app.get("/welcome")
def welcome():
    greeting = generate_support_message("Hello", "neutral")
    return {"message": greeting}


# ================= STARTUP WARMUP =================

@app.on_event("startup")
def warmup_llm():
    try:
        generate_support_message("hello", "neutral")
        print("🔥 MOODIFY.ai LLM warmed up")
    except:
        print("⚠️ Warmup skipped")


# ================= HEALTH CHECK =================

@app.post("/chat")
def chat():
    return {"reply": "Backend working fine"}


# =================== SPOTIFY ===================

@app.get("/spotify-login")
def spotify_login():
    auth_url = auth_manager.get_authorize_url()
    return RedirectResponse(auth_url)


@app.get("/spotify-token")
def spotify_token():
    token_info = auth_manager.get_cached_token()

    if not token_info:
        return {"error": "Not authenticated"}

    return {"token": token_info["access_token"]}

@app.get("/spotify-search")
def spotify_search(query: str):
    tracks = search_track(query)

    return [
        {
            "name": t["name"],
            "artist": t["artists"][0]["name"],
            "uri": t["uri"],
            "image": t["album"]["images"][0]["url"]
        }
        for t in tracks
    ]


from fastapi.responses import JSONResponse
from spotify_service import get_recommendations_by_mood

@app.get("/spotify-recommend")
def spotify_recommend(mood: str):

    try:
        tracks = get_recommendations_by_mood(mood)

        if not tracks:
            return []

        return [
            {
                "name": t["name"],
                "artist": t["artists"][0]["name"],
                "uri": t["uri"],
                "image": t["album"]["images"][0]["url"]
            }
            for t in tracks
        ]

    except Exception as e:
        print("🔥 Spotify Recommend Error:", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )
        

@app.get("/callback")
def spotify_callback(request: Request):
    code = request.query_params.get("code")

    if not code:
        return {"error": "No code received"}

    # Let spotipy handle token exchange
    sp.auth_manager.get_access_token(code)

    # After successful login → redirect back to homepage
    return RedirectResponse(url="/")


@app.get("/spotify-token")
def spotify_token():
    token_info = auth_manager.get_cached_token()

    if not token_info:
        return {"error": "Not authenticated"}

    return {"token": token_info["access_token"]}