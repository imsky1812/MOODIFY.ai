import cv2
import requests
import time
from collections import deque
from deepface import DeepFace

# ================= SETTINGS =================

BACKEND_URL = "http://127.0.0.1:8000/face-support/"

FRAME_SKIP = 25
EMOTION_SMOOTHING = 6
REQUEST_TIMEOUT = 5

FACE_SCALE = 0.5

# ================= INITIALIZE CAMERA =================

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Could not open webcam")
    exit()

print("🚀 Starting MOODIFY.ai Live Assistant (Press Q to quit)")

# ================= STATE =================

frame_count = 0
last_emotion = None
last_request_time = 0

ai_message = "Initializing AI..."

wellbeing_score = 75
risk_level = "Healthy"

emotion_history = deque(maxlen=EMOTION_SMOOTHING)

# ================= HELPERS =================


def get_risk_color(risk):

    if risk == "HIGH":
        return (0, 0, 255)

    if risk == "MEDIUM":
        return (0, 165, 255)

    return (0, 255, 0)


def wrap_text(text, max_chars=45, max_lines=3):

    words = text.split()

    lines = []
    line = ""

    for word in words:

        if len(line + word) < max_chars:
            line += word + " "

        else:
            lines.append(line.strip())
            line = word + " "

    lines.append(line.strip())

    return lines[:max_lines]


def stable_emotion():

    """Return most frequent emotion in history"""

    if not emotion_history:
        return None

    return max(set(emotion_history), key=emotion_history.count)


# ================= MAIN LOOP =================

while True:

    ret, frame = cap.read()

    if not ret:
        print("⚠️ Frame capture failed")
        break

    frame_count += 1

    try:

        # ================= ANALYSIS =================

        if frame_count % FRAME_SKIP == 0:

            small_frame = cv2.resize(
                frame,
                None,
                fx=FACE_SCALE,
                fy=FACE_SCALE
            )

            result = DeepFace.analyze(
                small_frame,
                actions=["emotion"],
                enforce_detection=False,
                silent=True
            )

            detected = result[0]["dominant_emotion"]

            emotion_history.append(detected)

            emotion = stable_emotion()

            if emotion and emotion != last_emotion:

                # prevent rapid backend spam
                if time.time() - last_request_time > 2:

                    last_emotion = emotion
                    last_request_time = time.time()

                    try:

                        response = requests.post(
                            BACKEND_URL,
                            json={"emotion": emotion},
                            timeout=REQUEST_TIMEOUT
                        )

                        if response.status_code == 200:

                            data = response.json()

                            ai_message = data.get("support_message", ai_message)
                            wellbeing_score = data.get("wellbeing_score", wellbeing_score)
                            risk_level = data.get("risk_level", risk_level)

                            print("\n🎭 Emotion:", emotion)
                            print("💚 Wellbeing:", wellbeing_score)
                            print("⚠️ Risk:", risk_level)
                            print("🤖 AI:", ai_message)

                    except requests.exceptions.RequestException as e:

                        ai_message = "Connecting to AI..."
                        print("Backend connection error:", e)

        # ================= DISPLAY =================

        overlay = frame.copy()

        cv2.rectangle(
            overlay,
            (20, 20),
            (640, 240),
            (0, 0, 0),
            -1
        )

        frame = cv2.addWeighted(
            overlay,
            0.4,
            frame,
            0.6,
            0
        )

        # Emotion
        if last_emotion:

            cv2.putText(
                frame,
                f"Emotion: {last_emotion}",
                (40, 50),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.9,
                (0, 255, 255),
                2
            )

        # Wellbeing
        cv2.putText(
            frame,
            f"Wellbeing Score: {wellbeing_score}%",
            (40, 85),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 200, 255),
            2
        )

        # Risk
        cv2.putText(
            frame,
            f"Status: {risk_level}",
            (40, 120),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            get_risk_color(risk_level),
            2
        )

        # AI Message
        lines = wrap_text(ai_message)

        y = 160

        for line in lines:

            cv2.putText(
                frame,
                line,
                (40, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 0),
                2
            )

            y += 30

    except Exception as e:

        print("Face analysis error:", e)

    # ================= SHOW WINDOW =================

    cv2.imshow("MOODIFY.ai Live Assistant", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break


# ================= CLEAN EXIT =================

cap.release()
cv2.destroyAllWindows()

print("🛑 MOODIFY.ai stopped cleanly.")