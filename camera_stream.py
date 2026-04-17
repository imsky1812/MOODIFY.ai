import cv2
import numpy as np
import base64
from deepface import DeepFace
from collections import deque
import time

EMOTION_SMOOTHING = 5
emotion_history = deque(maxlen=EMOTION_SMOOTHING)

# State
last_emotion = "Detecting..."
wellbeing_score = "--"
risk_level = "LOW"
ai_message = "Detecting your emotion..."

last_inference_time = 0

def stable_emotion():
    if not emotion_history:
        return None
    return max(set(emotion_history), key=emotion_history.count)

def get_state():
    return {
        "emotion": last_emotion,
        "wellbeing": wellbeing_score,
        "risk": risk_level,
        "message": ai_message,
    }

def update_state(score, risk, msg):
    global wellbeing_score, risk_level, ai_message
    if score is not None:
        wellbeing_score = score
    if risk:
        risk_level = risk
    if msg:
        ai_message = msg

def analyze_base64_frame(b64_string):
    global last_emotion, last_inference_time
    
    now = time.time()
    # Limit inference to 1 fps to save CPU on the server
    if now - last_inference_time < 0.5:
        return last_emotion

    try:
        # decode base64
        header, encoded = b64_string.split(",", 1) if "," in b64_string else ("", b64_string)
        img_data = base64.b64decode(encoded)
        np_arr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            return last_emotion

        # Run DeepFace
        result = DeepFace.analyze(
            frame,
            actions=["emotion"],
            enforce_detection=False,
            silent=True
        )
        detected = result[0]["dominant_emotion"]
        emotion_history.append(detected)
        
        emotion = stable_emotion()
        if emotion:
            last_emotion = emotion
            
        last_inference_time = now

    except Exception as e:
        pass
        
    return last_emotion
