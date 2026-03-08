import sounddevice as sd
import numpy as np
import speech_recognition as sr
from scipy.io.wavfile import write
import tempfile
import os

# ================= AUDIO SETTINGS =================

SAMPLE_RATE = 16000      # speech recognition works best around 16kHz
CHANNELS = 1
MAX_DURATION = 6         # maximum recording seconds
SILENCE_THRESHOLD = 0.01


# ================= TEMP AUDIO FILE =================

AUDIO_FILE = os.path.join(tempfile.gettempdir(), "moodify_voice.wav")


# ================= RECORD AUDIO =================

def record_audio():
    """
    Record audio from microphone and save as WAV.
    """

    print("🎤 Speak now...")

    try:

        recording = sd.rec(
            int(MAX_DURATION * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="float32"
        )

        sd.wait()

        # Normalize audio
        recording = np.clip(recording, -1, 1)

        # Convert float32 → int16
        recording_int16 = np.int16(recording * 32767)

        write(AUDIO_FILE, SAMPLE_RATE, recording_int16)

        print("Recording saved")

    except Exception as e:

        print("Recording error:", e)


# ================= SPEECH TO TEXT =================

def speech_to_text():
    """
    Convert recorded audio to text using Google Speech Recognition.
    """

    recognizer = sr.Recognizer()

    try:

        with sr.AudioFile(AUDIO_FILE) as source:

            recognizer.adjust_for_ambient_noise(source, duration=0.3)

            audio = recognizer.record(source)

        text = recognizer.recognize_google(audio)

        return text.strip()

    except sr.UnknownValueError:

        return ""

    except sr.RequestError as e:

        print("Speech recognition error:", e)

        return ""

    except Exception as e:

        print("STT error:", e)

        return ""