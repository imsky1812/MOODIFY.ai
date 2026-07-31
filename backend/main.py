import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Request, UploadFile, File, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
from typing import Optional
from starlette.middleware.sessions import SessionMiddleware
from datetime import datetime
import requests
import subprocess
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
    generate_agent_response,
)

from text_emotion import detect_text_emotion
from mental_state import calculate_stress_score

from conversation_memory import (
    add_user_message,
    add_assistant_message,
    get_history,
    message_count,
    set_score,
    get_score,
    clear_memory,
)

from database import (
    init_db,
    upsert_user,
    get_chat_history as db_get_chat_history,
    get_mood_logs,
    get_analytics_data,
    log_session,
    get_user_sessions,
    create_community_post,
    get_community_posts,
    clear_chat_history,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

# ================= INIT =================

app = FastAPI()

# Add Session Middleware
session_secret = os.getenv("SESSION_SECRET_KEY", "moodify-secret-key-super-secure-12345")
app.add_middleware(SessionMiddleware, secret_key=session_secret)

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


# ================= AUTH SYSTEM =================

class GoogleLoginInput(BaseModel):
    credential: str

def require_auth(request: Request):
    if not request.session.get("user"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return request.session.get("user")

import csv

def get_location_from_ip(ip: str):
    """Perform GeoIP lookup to find city, region, and country."""
    if not ip or ip in ("127.0.0.1", "localhost", "::1"):
        return "Delhi, India (Localhost Test)"
    try:
        # Using free GeoIP lookup API
        res = requests.get(f"http://ip-api.com/json/{ip}", timeout=3)
        if res.status_code == 200:
            data = res.json()
            if data.get("status") == "success":
                city = data.get("city", "Unknown City")
                region = data.get("regionName", "Unknown Region")
                country = data.get("country", "Unknown Country")
                return f"{city}, {region}, {country}"
    except Exception as e:
        print(f"[GeoIP Warning] Location lookup failed: {e}")
    return "Unknown Location"

def log_user_login(email: str, name: str, ip: str):
    """Log user details to a local CSV backup and sync to Google Sheets via Web App URL."""
    login_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    location = get_location_from_ip(ip)
    
    # 1. Local CSV Backup
    csv_file_path = os.getenv("LOGINS_CSV_PATH", os.path.join(BASE_DIR, "..", "user_logins.csv"))
    file_exists = os.path.exists(csv_file_path)
    try:
        with open(csv_file_path, mode="a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(["Name", "Email", "Login Time", "Location", "IP Address"])
            writer.writerow([name, email, login_time, location, ip])
        print(f"[Local Log] Successfully logged login for {name} to user_logins.csv")
    except Exception as e:
        print(f"[Local Log Error] Failed to write to local CSV: {e}")
        
    # 2. Sync to Google Sheets via Web App URL if configured
    webapp_url = os.getenv("GOOGLE_SHEET_WEBAPP_URL")
    if webapp_url:
        try:
            payload = {
                "name": name,
                "email": email,
                "time": login_time,
                "location": location,
                "ip": ip
            }
            res = requests.post(webapp_url, json=payload, timeout=5)
            if res.status_code == 200:
                print(f"[Google Sheets Sync] Successfully synced login for {name} to Google Sheets")
            else:
                print(f"[Google Sheets Sync Warning] Webapp returned status code {res.status_code}: {res.text}")
        except Exception as e:
            print(f"[Google Sheets Sync Error] Sync request failed: {e}")
    else:
        print("[Google Sheets Sync] GOOGLE_SHEET_WEBAPP_URL not configured in .env. Skipping cloud sync.")

@app.get("/api/auth/status")
def auth_status(request: Request):
    user = request.session.get("user")
    google_client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    if user:
        return {"logged_in": True, "user": user, "google_client_id": google_client_id}
    return {"logged_in": False, "google_client_id": google_client_id}

@app.post("/api/auth/google")
def auth_google(data: GoogleLoginInput, request: Request):
    token = data.credential
    user_info = None
    
    if token == "mock_guest_token":
        user_info = {
            "email": "sarveshkyadav18@gmail.com",
            "name": "Sarvesh Yadav",
            "picture": ""
        }
    else:
        # Verify token with Google's tokeninfo
        try:
            try:
                res = requests.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={token}", timeout=5)
            except requests.exceptions.SSLError:
                res = requests.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={token}", timeout=5, verify=False)
                
            if res.status_code == 200:
                payload = res.json()
                user_info = {
                    "email": payload.get("email"),
                    "name": payload.get("name", payload.get("email")),
                    "picture": payload.get("picture", "")
                }
            else:
                print("[Auth Error] Google tokeninfo failed:", res.text)
        except Exception as e:
            print("[Auth Error] Exception during verification:", e)
            
    if not user_info:
        raise HTTPException(status_code=400, detail="Invalid Google token")
            
    request.session["user"] = user_info
    client_ip = request.client.host if request.client else "unknown"
    log_user_login(user_info["email"], user_info["name"], client_ip)
    # Upsert user in SQLite database
    try:
        upsert_user(user_info["email"], user_info["name"], user_info.get("picture", ""))
    except Exception as e:
        print(f"[DB Warning] Failed to upsert user: {e}")
    return {"status": "success", "user": user_info}

@app.post("/api/auth/logout")
def auth_logout(request: Request):
    request.session.clear()
    return {"status": "success"}


# ================= ROOT =================

@app.get("/")
def serve_ui():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


# ================= TEXT CHAT =================

class TextInput(BaseModel):
    text: str


@app.post("/analyze-text/")
def analyze_text(data: TextInput, user: dict = Depends(require_auth)):

    user_text = data.text.strip()
    user_email = user.get("email")

    if not user_text:
        return {
            "support_message": "Tell me what's on your mind.",
            "wellbeing_score": "Calculating...",
            "risk_level": "LOW",
        }

    # 1. Fetch previous history (excluding current turn)
    history = get_history(user_email=user_email)

    # 2. Call unified agent
    response = generate_agent_response(user_text, history)

    # 3. Detect user's text emotion
    user_emotion = detect_text_emotion(user_text)

    # 4. Wellbeing calculation & smoothing
    score = response.get("wellbeing_score")
    previous_score = get_score(user_email=user_email)

    if score is not None:
        if previous_score is None:
            set_score(score, user_email=user_email)
            wellbeing = score
        else:
            smooth_score = int(previous_score * 0.7 + score * 0.3)
            set_score(smooth_score, user_email=user_email)
            wellbeing = smooth_score
    else:
        wellbeing = previous_score or 50

    # 5. Store user message in memory & DB with wellbeing score and detected emotion
    add_user_message(user_text, user_email=user_email, wellbeing_score=wellbeing, detected_emotion=user_emotion)

    # 6. Store assistant's message in memory & DB
    reply = response.get("reply", "")
    add_assistant_message(reply, user_email=user_email)

    # Extract risk level and commands
    risk = response.get("risk_level", "LOW")
    command = response.get("command", "none")
    music_query = response.get("music_query", None)

    if command == "none":
        command = None

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
def face_support(data: FaceEmotionInput, user: dict = Depends(require_auth)):

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

class FrameInput(BaseModel):
    image: str

@app.post("/analyze-frame/")
def analyze_frame(data: FrameInput, user: dict = Depends(require_auth)):
    # Only processes 1 fps internally to avoid lag
    emotion = camera_stream.analyze_base64_frame(data.image)
    
    # State tracking
    current_state = camera_stream.get_state()
    
    if emotion != current_state["emotion"] and emotion != "Detecting...":
        score, risk = calculate_stress_score("neutral", emotion)
        msg = generate_support_message(f"I am feeling {emotion}", emotion)
        camera_stream.update_state(score, risk, msg)
        
    return camera_stream.get_state()


@app.get("/camera-state")
def get_camera_state(user: dict = Depends(require_auth)):
    return camera_stream.get_state()


@app.get("/stop-camera")
def stop_camera(user: dict = Depends(require_auth)):
    return {"status": "camera stopped"}


# ================= VOICE =================

import tempfile
from static_ffmpeg import run
ffmpeg_bin, _ = run.get_or_fetch_platform_executables_else_raise()

@app.post("/analyze-audio/")
async def analyze_audio(audio: UploadFile = File(...), user: dict = Depends(require_auth)):
    
    fd, path = tempfile.mkstemp(suffix=".webm")
    wav_path = path[:-5] + ".wav"
    try:
        with os.fdopen(fd, 'wb') as f:
            content = await audio.read()
            print(f"[Audio Endpoint] Received {len(content)} bytes of audio input")
            f.write(content)
            
        # Convert webm to wav because SpeechRecognition requires PCM WAV
        result = subprocess.run(
            [ffmpeg_bin, "-y", "-i", path, "-ac", "1", "-ar", "16000", wav_path],
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE
        )
        if result.returncode != 0:
            print("[Audio Endpoint] FFmpeg conversion failed:")
            print("FFmpeg error:", result.stderr.decode('utf-8', errors='ignore'))
        else:
            if os.path.exists(wav_path):
                print(f"[Audio Endpoint] FFmpeg conversion succeeded. WAV size: {os.path.getsize(wav_path)} bytes")
            else:
                print(f"[Audio Endpoint] FFmpeg returned 0, but WAV file does not exist at {wav_path}")
            
        from voice_emotion import speech_to_text
        text = speech_to_text(wav_path)
        print(f"[Audio Endpoint] Speech-to-text recognized text: '{text}'")
        
        user_email = user.get("email")
        command = None
        music_query = None
        if text:
            # Fetch previous history (excluding current turn)
            history = get_history(user_email=user_email)

            # Call unified agent
            response = generate_agent_response(text, history)
            
            # Detect user's text emotion
            user_emotion = detect_text_emotion(text)

            # Wellbeing calculation & smoothing
            score = response.get("wellbeing_score")
            previous_score = get_score(user_email=user_email)

            if score is not None:
                if previous_score is None:
                    set_score(score, user_email=user_email)
                    wellbeing = score
                else:
                    smooth_score = int(previous_score * 0.7 + score * 0.3)
                    set_score(smooth_score, user_email=user_email)
                    wellbeing = smooth_score
            else:
                wellbeing = previous_score or 50

            # Store user message in memory & DB with wellbeing score and detected emotion
            add_user_message(text, user_email=user_email, wellbeing_score=wellbeing, detected_emotion=user_emotion)
            
            # Store assistant's message in memory & DB
            reply = response.get("reply", "")
            add_assistant_message(reply, user_email=user_email)
            
            command = response.get("command", "none")
            music_query = response.get("music_query", None)
            
            if command == "none":
                command = None
        else:
            text = ""
            reply = "I couldn't catch that, could you please repeat?"
            
        # Generate Edge TTS audio
        import base64
        from ai_voice import _save_audio
        fd2, speech_path = tempfile.mkstemp(suffix=".mp3")
        os.close(fd2)
        try:
            await _save_audio(reply, speech_path)
            with open(speech_path, "rb") as bf:
                audio_b64 = base64.b64encode(bf.read()).decode("utf-8")
        except Exception as tts_err:
            print("TTS error:", tts_err)
            audio_b64 = ""
        finally:
            if os.path.exists(speech_path):
                os.remove(speech_path)
                
        return {
            "text": text,
            "reply": reply,
            "audio_b64": audio_b64,
            "command": command,
            "music_query": music_query
        }
            
    except Exception as e:
        print("Audio error:", e)
        import traceback
        traceback.print_exc()
    finally:
        if os.path.exists(path):
            os.remove(path)
        if os.path.exists(wav_path):
            os.remove(wav_path)
            
    return {"text": "", "reply": "I couldn't catch that, could you please repeat?", "audio_b64": ""}

@app.get("/stop-voice")
def stop_voice(user: dict = Depends(require_auth)):
    return {"status": "stopped"}


# ================= SCORE =================

@app.get("/current-score")
def current_score(user: dict = Depends(require_auth)):

    score = get_score(user_email=user.get("email"))

    if score is None:
        return {"score": "Start chatting to calculate"}

    return {"score": score}


@app.get("/initial-score")
def initial_score(user: dict = Depends(require_auth)):
    return {"wellbeing_score": "Start chatting to calculate"}


# ================= WELCOME =================

@app.get("/welcome")
def welcome(user: dict = Depends(require_auth)):
    username = user.get("name", "User")
    prompt = f"System directive: The user has successfully logged in. Their name is {username}. Greet them by their name, introducing yourself as MOODIFY.ai in your signature tough-love, direct, critical style, asking what is on their mind."
    response = generate_agent_response(prompt, [])
    greeting = response.get("reply", f"Hello {username}, I am MOODIFY.ai. What is on your mind today?")
    return {"message": greeting}



# ================= STARTUP =================

@app.on_event("startup")
def startup_event():
    # Initialize SQLite database tables
    try:
        init_db()
    except Exception as e:
        print(f"[DB Error] Failed to initialize database: {e}")
    # Warm up LLM
    try:
        generate_support_message("hello", "neutral")
        print("[OK] MOODIFY.ai LLM warmed up")
    except Exception:
        print("[WARN] Warmup skipped")


# ================= HEALTH =================

@app.post("/chat")
def chat(user: dict = Depends(require_auth)):
    return {"reply": "Backend working fine"}



# ================= SPOTIFY LOGIN =================

@app.get("/spotify-login")
def spotify_login(user: dict = Depends(require_auth)):

    auth_url = auth_manager.get_authorize_url()

    return RedirectResponse(auth_url)


# ================= SPOTIFY CALLBACK =================

@app.get("/callback")
def spotify_callback(request: Request, user: dict = Depends(require_auth)):

    code = request.query_params.get("code")

    if not code:
        return {"error": "Spotify authorization failed"}

    auth_manager.get_access_token(code)

    return RedirectResponse("/")


# ================= GET TOKEN =================

@app.get("/spotify-token")
def spotify_token(user: dict = Depends(require_auth)):

    token = get_valid_token()

    if not token:
        return {"error": "Not authenticated"}

    return {"token": token}


# ================= SEARCH =================

@app.get("/spotify-search")
def spotify_search(query: str, user: dict = Depends(require_auth)):

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


# ================= PERSISTENT DATA API =================

class SessionInput(BaseModel):
    session_type: str
    duration_seconds: int
    wellbeing_before: Optional[int] = None
    wellbeing_after: Optional[int] = None

class CommunityPostInput(BaseModel):
    content: str
    mood_tag: Optional[str] = None


@app.get("/api/history")
def api_history(user: dict = Depends(require_auth)):
    """Retrieve full chat history for the logged-in user."""
    email = user.get("email")
    try:
        rows = db_get_chat_history(email, limit=200)
        return {"history": rows}
    except Exception as e:
        print(f"[API Error] /api/history: {e}")
        return {"history": []}


@app.get("/api/analytics")
def api_analytics(days: int = 30, user: dict = Depends(require_auth)):
    """Return aggregated wellbeing scores by day for chart rendering."""
    email = user.get("email")
    try:
        data = get_analytics_data(email, days=days)
        return {"analytics": data}
    except Exception as e:
        print(f"[API Error] /api/analytics: {e}")
        return {"analytics": []}


@app.get("/api/logs")
def api_logs(user: dict = Depends(require_auth)):
    """Return detailed mood logs for the Mood Log view."""
    email = user.get("email")
    try:
        logs = get_mood_logs(email, limit=100)
        return {"logs": logs}
    except Exception as e:
        print(f"[API Error] /api/logs: {e}")
        return {"logs": []}


@app.delete("/api/logs")
def api_clear_logs(user: dict = Depends(require_auth)):
    """Clear all chat history logs for the logged-in user."""
    email = user.get("email")
    try:
        clear_chat_history(email)
        # Also clear this user's in-memory history to reset active chat context
        clear_memory(user_email=email)
        return {"status": "success"}
    except Exception as e:
        print(f"[API Error] DELETE /api/logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear logs")


@app.get("/api/sessions")
def api_get_sessions(user: dict = Depends(require_auth)):
    """Retrieve past meditation sessions."""
    email = user.get("email")
    try:
        sessions = get_user_sessions(email)
        return {"sessions": sessions}
    except Exception as e:
        print(f"[API Error] GET /api/sessions: {e}")
        return {"sessions": []}


@app.post("/api/sessions")
def api_log_session(data: SessionInput, user: dict = Depends(require_auth)):
    """Record a completed meditation/breathing session."""
    email = user.get("email")
    try:
        log_session(
            user_email=email,
            session_type=data.session_type,
            duration_seconds=data.duration_seconds,
            wellbeing_before=data.wellbeing_before,
            wellbeing_after=data.wellbeing_after,
        )
        return {"status": "success"}
    except Exception as e:
        print(f"[API Error] POST /api/sessions: {e}")
        raise HTTPException(status_code=500, detail="Failed to log session")


@app.get("/api/community/posts")
def api_get_community_posts():
    """Retrieve anonymous community wellness posts (public endpoint)."""
    try:
        posts = get_community_posts(limit=50)
        return {"posts": posts}
    except Exception as e:
        print(f"[API Error] GET /api/community/posts: {e}")
        return {"posts": []}


@app.post("/api/community/posts")
def api_create_community_post(data: CommunityPostInput, user: dict = Depends(require_auth)):
    """Create a new anonymous community wellness post."""
    email = user.get("email")
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Post content cannot be empty")
    try:
        alias = create_community_post(email, content, data.mood_tag)
        return {"status": "success", "alias": alias}
    except Exception as e:
        print(f"[API Error] POST /api/community/posts: {e}")
        raise HTTPException(status_code=500, detail="Failed to create post")


# ================= RECOMMEND =================

@app.get("/spotify-recommend")
def spotify_recommend(mood: str, user: dict = Depends(require_auth)):

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