from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
import subprocess
import sys
import camera_stream

from spotify_service import (
    search_track,
    get_recommendations_by_mood,
    auth_manager,
    get_valid_token
)

from llm_response import (
    detect_crisis_intent,
    generate_support_message,
    calculate_wellbeing,
    generate_music_query,
    detect_music_intent,
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


# ================= HELPERS =================

def format_tracks(tracks):
    """Convert Spotify tracks to frontend format."""
    return [
        {
            "name": t["name"],
            "artist": t["artists"][0]["name"],
            "uri": t["uri"],
            "image": t["album"]["images"][0]["url"],
        }
        for t in tracks
    ]


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

    # Crisis detection
    risk = detect_crisis_intent(user_text)

    # Store conversation
    add_user_message(user_text)

    music_query = None
    command = None

    # AI Music Intent
    if detect_music_intent(user_text):
        music_query = generate_music_query(user_text)
        reply = ""
    else:
        reply = generate_support_message(user_text, "neutral")

    if reply.startswith("COMMAND:"):
        command = reply.replace("COMMAND:", "").strip()
        reply = "Here's something that might help."

    # Wellbeing calculation
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
                smooth_score = int(previous_score * 0.7 + score * 0.3)
                set_score(smooth_score)
                wellbeing = smooth_score
        else:
            wellbeing = previous_score or "Calculating..."

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

@app.get("/video-feed")
def video_feed():
    """MJPEG stream — embed directly in browser via <img src='/video-feed'>."""
    return StreamingResponse(
        camera_stream.generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/camera-state")
def camera_state():
    """Returns latest detected emotion, wellbeing score, risk and AI message."""
    return camera_stream.get_state()


@app.get("/stop-camera")
def stop_camera():
    camera_stream.stop_camera()
    return {"status": "camera stopped"}


# ================= VOICE =================

@app.get("/start-voice")
def start_voice():
    if not hasattr(app.state, "voice_running") or not app.state.voice_running:
        app.state.voice_running = True
        
        # Start voice assistant as a subprocess and keep reference
        app.state.voice_process = subprocess.Popen(
            [sys.executable, "voice_assistant.py"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    return {"status": "voice started"}


@app.get("/voice-cycle")
def voice_cycle():

    global voice_session_active
    voice_session_active = True

    # Lazy imports (only used when voice enabled)
    from voice_emotion import record_audio, speech_to_text

    if not voice_session_active:
        return {"text": "", "reply": ""}

    record_audio()
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
    
    # Terminate the subprocess if running
    if hasattr(app.state, "voice_running") and app.state.voice_running:
        try:
            if hasattr(app.state, "voice_process") and app.state.voice_process:
                app.state.voice_process.terminate()
                app.state.voice_process.wait(timeout=2)
        except Exception as e:
            print("Error terminating voice process:", e)
        
        app.state.voice_running = False
        app.state.voice_process = None

    return {"status": "stopped"}


# ================= SCORE =================

@app.get("/current-score")
def current_score():

    count = message_count()
    score = get_score()

    if count == 0:
        return {"score": "Start chatting to calculate"}

    if count < 7 and score is None:
        return {"score": "Calculating..."}

    return {"score": score or "Calculating..."}


@app.get("/initial-score")
def initial_score():
    return {"wellbeing_score": "Start chatting to calculate"}


# ================= WELCOME =================

@app.get("/welcome")
def welcome():
    greeting = generate_support_message("Hello", "neutral")
    return {"message": greeting}


# ================= STARTUP =================

@app.on_event("startup")
def warmup_llm():
    try:
        generate_support_message("hello", "neutral")
        print("🔥 MOODIFY.ai LLM warmed up")
    except Exception:
        print("⚠️ Warmup skipped")


# ================= HEALTH =================

@app.post("/chat")
def chat():
    return {"reply": "Backend working fine"}



# ================= SPOTIFY LOGIN =================

@app.get("/spotify-login")
def spotify_login():

    auth_url = auth_manager.get_authorize_url()

    return RedirectResponse(auth_url)


# ================= SPOTIFY CALLBACK =================

@app.get("/callback")
def spotify_callback(request: Request):

    code = request.query_params.get("code")

    if not code:
        return {"error": "Spotify authorization failed"}

    auth_manager.get_access_token(code)

    return RedirectResponse("/")


# ================= GET TOKEN =================

@app.get("/spotify-token")
def spotify_token():

    token = get_valid_token()

    if not token:
        return {"error": "Not authenticated"}

    return {"token": token}


# ================= SEARCH =================

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


# ================= RECOMMEND =================

@app.get("/spotify-recommend")
def spotify_recommend(mood: str):

    tracks = get_recommendations_by_mood(mood)

    return [
        {
            "name": t["name"],
            "artist": t["artists"][0]["name"],
            "uri": t["uri"],
            "image": t["album"]["images"][0]["url"]
        }
        for t in tracks
    ]