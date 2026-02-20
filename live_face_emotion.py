import cv2
import requests
from deepface import DeepFace

# start webcam
cap = cv2.VideoCapture(0)

print("Starting EmotiCare Live Assistant... Press 'q' to quit")

ai_message = "Initializing AI..."
last_emotion = None
frame_count = 0

# wellbeing variables
wellbeing_score = 75
risk_level = "Healthy"

while True:
    ret, frame = cap.read()

    if not ret:
        break

    frame_count += 1

    try:
        # analyze every 20 frames (prevents lag + too many API calls)
        if frame_count % 20 == 0:

            result = DeepFace.analyze(
                frame,
                actions=['emotion'],
                enforce_detection=False
            )

            emotion = result[0]['dominant_emotion']

            # only contact backend if emotion changed
            if emotion != last_emotion:
                last_emotion = emotion

                try:
                    response = requests.post(
                        "http://127.0.0.1:8000/face-support/",
                        json={"emotion": emotion},
                        timeout=5
                    )

                    data = response.json()

                    ai_message = data["support_message"]
                    wellbeing_score = data["wellbeing_score"]
                    risk_level = data["risk_level"]

                    print("\nDetected Emotion:", emotion)
                    print("Wellbeing Score:", wellbeing_score)
                    print("Risk Level:", risk_level)
                    print("AI Response:", ai_message)

                except Exception as e:
                    ai_message = "Connecting to AI..."
                    print("Backend connection error:", e)

        # ---------------- DISPLAY SECTION ----------------

        # emotion
        if last_emotion:
            cv2.putText(frame, f'Emotion: {last_emotion}',
                        (40, 50),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        1,
                        (0, 255, 0),
                        2,
                        cv2.LINE_AA)

        # wellbeing score
        cv2.putText(frame, f'Wellbeing Score: {wellbeing_score}%',
                    (40, 80),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 200, 255),
                    2,
                    cv2.LINE_AA)

        # risk level
        cv2.putText(frame, f'Status: {risk_level}',
                    (40, 110),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.8,
                    (0, 150, 255),
                    2,
                    cv2.LINE_AA)

        # wrap AI text onto multiple lines
        words = ai_message.split(' ')
        lines = []
        line = ""

        for word in words:
            if len(line + word) < 45:
                line += word + " "
            else:
                lines.append(line)
                line = word + " "

        lines.append(line)

        y = 150
        for l in lines[:3]:
            cv2.putText(frame, l.strip(),
                        (40, y),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (255, 255, 0),
                        2,
                        cv2.LINE_AA)
            y += 30

    except Exception as e:
        print("Face analysis error:", e)

    # show window
    cv2.imshow("EmotiCare Live Assistant", frame)

    # press q to quit
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()