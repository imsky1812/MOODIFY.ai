import asyncio
import edge_tts
import threading
import os
import tempfile

try:
    from playsound import playsound
except ImportError:
    playsound = None

# ================= ENGINE INIT =================

_voice_lock = threading.Lock()
VOICE_NAME = "en-IN-PrabhatNeural"
# ================= SPEAK FUNCTION =================

async def _save_audio(text, output_file):
    """Generate audio using edge-tts asynchronously."""
    communicate = edge_tts.Communicate(text, VOICE_NAME)
    await communicate.save(output_file)

def speak(text: str):
    """
    Convert text to speech using edge-tts and play it.
    Thread-safe and interrupt-safe.
    """
    if not text:
        return

    if playsound is None:
        print("[Warning] playsound is not installed. Cannot play audio locally on the server.")
        return

    with _voice_lock:
        try:
            # Create a unique temporary file to store the audio to prevent Windows locking errors
            import uuid
            unique_id = uuid.uuid4().hex
            temp_file = os.path.join(tempfile.gettempdir(), f"moodify_voice_{unique_id}.mp3")
            
            # Generate the audio blockingly (wait for asyncio task)
            asyncio.run(_save_audio(text, temp_file))
            
            # Play the audio blockingly
            playsound(temp_file)
            
            # Clean up immediately after playback
            try:
                os.remove(temp_file)
            except OSError:
                pass
                
        except Exception as e:
            print("TTS error:", e)