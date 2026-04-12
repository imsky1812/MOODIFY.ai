import cv2
import time
from collections import deque
from deepface import DeepFace

# ================= SETTINGS =================

FRAME_SKIP = 20
EMOTION_SMOOTHING = 6

FACE_SCALE = 0.5

# ================= SHARED STATE =================

_cap = None
_running = False

last_emotion = "Detecting..."
wellbeing_score = "--"
risk_level = "LOW"
ai_message = "Initializing..."

emotion_history = deque(maxlen=EMOTION_SMOOTHING)


def get_state():
    return {
        "emotion": last_emotion,
        "wellbeing": wellbeing_score,
        "risk": risk_level,
        "message": ai_message,
    }


def update_state(emotion, wellbeing, risk, message):
    global last_emotion, wellbeing_score, risk_level, ai_message
    last_emotion = emotion
    wellbeing_score = wellbeing
    risk_level = risk
    ai_message = message


def stable_emotion():
    if not emotion_history:
        return None
    return max(set(emotion_history), key=emotion_history.count)


def is_running():
    return _running and _cap is not None and _cap.isOpened()


def stop_camera():
    global _cap, _running
    _running = False
    if _cap is not None:
        _cap.release()
        _cap = None


def generate_frames():
    """MJPEG generator — yields JPEG frames for StreamingResponse."""
    global _cap, _running, last_emotion, wellbeing_score, risk_level, ai_message

    _cap = cv2.VideoCapture(0)

    if not _cap.isOpened():
        return

    _running = True
    frame_count = 0
    last_request_time = 0

    import requests

    BACKEND_URL = "http://127.0.0.1:8000/face-support/"

    while _running:
        ret, frame = _cap.read()
        if not ret:
            break

        frame_count += 1

        # ---- Emotion Analysis ----
        try:
            if frame_count % FRAME_SKIP == 0:
                small = cv2.resize(frame, None, fx=FACE_SCALE, fy=FACE_SCALE)
                result = DeepFace.analyze(
                    small,
                    actions=["emotion"],
                    enforce_detection=False,
                    silent=True,
                )
                detected = result[0]["dominant_emotion"]
                emotion_history.append(detected)
                emotion = stable_emotion()

                if emotion and emotion != last_emotion:
                    if time.time() - last_request_time > 2:
                        last_emotion = emotion
                        last_request_time = time.time()
                        try:
                            resp = requests.post(
                                BACKEND_URL,
                                json={"emotion": emotion},
                                timeout=4,
                            )
                            if resp.status_code == 200:
                                data = resp.json()
                                wellbeing_score = data.get("wellbeing_score", wellbeing_score)
                                risk_level = data.get("risk_level", risk_level)
                                ai_message = data.get("support_message", ai_message)
                        except Exception:
                            pass
        except Exception:
            pass

        # ---- Encode JPEG ----
        ret2, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if not ret2:
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + buffer.tobytes()
            + b"\r\n"
        )

    stop_camera()
