from fastapi import FastAPI
from pydantic import BaseModel
from text_emotion import detect_text_emotion
from llm_response import generate_support_message
from mental_state import calculate_stress_score
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import subprocess
import sys



app = FastAPI()
voice_session_active = False
CURRENT_SCORE = 75

app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/")
def serve_ui():
    return FileResponse("frontend/index.html")

class TextInput(BaseModel):
    text: str

@app.get("/")
def home():
    return {"message": "EmotiCare AI Backend Running"}

@app.post("/analyze-text/")
def analyze_text(data: TextInput):

    user_text = data.text

    # 1️⃣ detect emotion only for scoring
    text_emotion = detect_text_emotion(user_text)

    # assume neutral face for now
    face_emotion = "neutral"

    score, risk = calculate_stress_score(text_emotion, face_emotion)

    global CURRENT_SCORE
    CURRENT_SCORE = score

    # 2️⃣ AI responds to actual text
    support_message = generate_support_message(user_text, text_emotion)

    return {
        "text_emotion": text_emotion,
        "wellbeing_score": score,
        "risk_level": risk,
        "support_message": support_message
    }

from pydantic import BaseModel

class FaceEmotionInput(BaseModel):
    emotion: str

@app.post("/face-support/")
def face_support(data: FaceEmotionInput):

    face_emotion = data.emotion

    # assume no text input right now
    text_emotion = "neutral"

    global CURRENT_SCORE
    score, risk = calculate_stress_score(text_emotion, face_emotion)
    CURRENT_SCORE = score

    support_message = generate_support_message(face_emotion)

    return {
        "detected_emotion": face_emotion,
        "wellbeing_score": score,
        "risk_level": risk,
        "support_message": support_message
    }

@app.get("/start-camera")
def start_camera():
    subprocess.Popen([sys.executable, "live_face_emotion.py"])
    return {"status": "camera started"}

@app.get("/start-voice")
def start_voice():
    if not hasattr(app.state, "voice_running") or not app.state.voice_running:
        app.state.voice_running = True
        subprocess.Popen([sys.executable, "voice_assistant.py"])
    return {"status": "voice started"}

@app.get("/current-score")
def current_score():
    return {"score": CURRENT_SCORE}

@app.get("/voice-cycle")
def voice_cycle():

    global voice_session_active
    voice_session_active = True

    from voice_emotion import record_audio, speech_to_text
    from ai_voice import speak

    # if user already exited
    if not voice_session_active:
        return {"text": "", "reply": ""}

    record_audio()

    if not voice_session_active:
        return {"text": "", "reply": ""}

    text = speech_to_text()

    if not voice_session_active:
        return {"text": "", "reply": ""}

    emotion = detect_text_emotion(text)
    response = generate_support_message(text, emotion)

    if voice_session_active:
        speak(response)

    return {
        "text": text,
        "reply": response
    }
    
    
@app.get("/stop-voice")
def stop_voice():
    global voice_session_active
    voice_session_active = False
    return {"status": "stopped"}

@app.get("/welcome")
def welcome():
    greeting = generate_support_message(
        "Hello",
        "neutral"
    )

    return {"message": greeting}

@app.on_event("startup")
def warmup_llm():
    try:
        generate_support_message("hello", "neutral")
        print("Moodify AI warmed up")
    except:
        print("Warmup skipped")