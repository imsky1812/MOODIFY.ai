import speech_recognition as sr
import os

# ================= SPEECH TO TEXT =================

def speech_to_text(audio_file_path):
    """
    Convert recorded audio to text using Google Speech Recognition.
    """
    recognizer = sr.Recognizer()
    try:
        # Pydub/librosa might be needed here if webm is blocked 
        # but SpeechRecognition uses underlying libraries if possible.
        with sr.AudioFile(audio_file_path) as source:
            audio = recognizer.record(source)
            
        text = recognizer.recognize_google(audio)
        return text.strip()
        
    except sr.UnknownValueError:
        print("[STT Info] Google Speech Recognition could not understand the audio (UnknownValueError).")
        return ""
    except sr.RequestError as e:
        print(f"[STT Error] Google Speech Recognition service request failed: {e}")
        return ""
    except Exception as e:
        print("STT error:", e)
        import traceback
        traceback.print_exc()
        return ""