import sounddevice as sd
import numpy as np
import speech_recognition as sr
from scipy.io.wavfile import write

fs = 44100
seconds = 5

def record_audio():
    print("Speak now...")

    # record audio
    recording = sd.rec(int(seconds * fs), samplerate=fs, channels=1, dtype='float32')
    sd.wait()

    # convert float32 → int16 (THIS FIXES THE ERROR)
    recording_int16 = np.int16(recording * 32767)

    # save proper PCM WAV
    write("voice.wav", fs, recording_int16)

    print("Recording saved")

def speech_to_text():
    recognizer = sr.Recognizer()

    with sr.AudioFile("voice.wav") as source:
        audio = recognizer.record(source)

    try:
        text = recognizer.recognize_google(audio)
        return text
    except:
        return "i didn't speak anything yet"
