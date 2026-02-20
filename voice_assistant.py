import requests
import keyboard
from voice_emotion import record_audio, speech_to_text
from ai_voice import speak
from playsound import playsound
import time

print("\nMOODIFY.AI Voice Assistant Started")
print("Press Q anytime to stop.\n")

running = True

while running:

    # play notification beep
    try:
        playsound("./frontend/assets/beep.mp3")
    except:
        pass

    print("Listening... Speak now")

    # record user voice
    record_audio()

    # convert to text
    text = speech_to_text()
    print("You:", text)

    # stop command
    if text.lower() in ["quit", "exit", "stop"]:
        print("Stopping voice assistant...")
        break

    try:
        response = requests.post(
            "http://127.0.0.1:8000/analyze-text/",
            json={"text": text},
            timeout=30
        )

        data = response.json()
        ai_reply = data["support_message"]

        print("AI:", ai_reply)
        speak(ai_reply)

    except Exception as e:
        print("Server error:", e)
        speak("I am having trouble connecting to the server.")

    # check keyboard quit
    if keyboard.is_pressed('q'):
        print("Voice assistant stopped by user.")
        break

    time.sleep(0.5)