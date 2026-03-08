import pyttsx3
import threading

# ================= ENGINE INIT =================

_engine = None
_engine_lock = threading.Lock()


def _init_engine():
    """Initialize TTS engine once."""

    global _engine

    if _engine is None:

        _engine = pyttsx3.init()

        # Speech speed
        _engine.setProperty("rate", 170)

        # Volume
        _engine.setProperty("volume", 1.0)

        # Try selecting female voice if available
        voices = _engine.getProperty("voices")

        for voice in voices:
            name = voice.name.lower()
            if "female" in name or "zira" in name:
                _engine.setProperty("voice", voice.id)
                break


# Initialize on import
_init_engine()


# ================= SPEAK FUNCTION =================

def speak(text: str):
    """
    Convert text to speech.
    Thread-safe and interrupt-safe.
    """

    if not text:
        return

    with _engine_lock:

        try:

            # Stop any current speech
            _engine.stop()

            _engine.say(text)
            _engine.runAndWait()

        except Exception as e:

            print("TTS error:", e)


# ================= OPTIONAL: STOP SPEECH =================

def stop_speaking():
    """Force stop current speech."""

    global _engine

    if _engine:

        try:
            _engine.stop()
        except Exception:
            pass