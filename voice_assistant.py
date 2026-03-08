import requests
import keyboard
import time
from playsound import playsound

from voice_emotion import record_audio, speech_to_text
from ai_voice import speak


# ================= CONFIG =================

SERVER_URL = "http://127.0.0.1:8000/analyze-text/"
BEEP_SOUND = "./frontend/assets/beep.mp3"

REQUEST_TIMEOUT = 30


# ================= AUDIO HELPERS =================

def play_beep():
    """Play listening notification sound."""
    try:
        playsound(BEEP_SOUND)
    except Exception:
        pass


# ================= SERVER REQUEST =================

def send_to_ai(text):
    """Send user text to Moodify backend."""

    try:

        response = requests.post(
            SERVER_URL,
            json={"text": text},
            timeout=REQUEST_TIMEOUT
        )

        response.raise_for_status()

        data = response.json()

        return data.get("support_message", "")

    except Exception as e:

        print("Server error:", e)

        return "I am having trouble connecting to the server."


# ================= VOICE LOOP =================

def run_voice_assistant():

    print("\nMOODIFY.AI Voice Assistant Started")
    print("Press Q anytime to stop.\n")

    running = True

    while running:

        # Check quit key first
        if keyboard.is_pressed("q"):
            print("Voice assistant stopped by user.")
            break

        play_beep()

        print("Listening... Speak now")

        # Record voice
        record_audio()

        # Speech → text
        text = speech_to_text()

        if not text:
            print("No speech detected.")
            continue

        print("You:", text)

        command = text.lower().strip()

        # Stop commands
        if command in {"quit", "exit", "stop"}:
            print("Stopping voice assistant...")
            break

        # Send to backend
        ai_reply = send_to_ai(text)

        if not ai_reply:
            continue

        print("AI:", ai_reply)

        # Speak response
        speak(ai_reply)

        # Small cooldown to prevent loop spikes
        time.sleep(0.3)


# ================= ENTRY POINT =================

if __name__ == "__main__":
    run_voice_assistant()