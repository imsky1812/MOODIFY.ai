from transformers import pipeline

# Load once when server starts
emotion_model = pipeline(
    "text-classification",
    model="j-hartmann/emotion-english-distilroberta-base"
)

def detect_text_emotion(text):
    result = emotion_model(text)
    return result[0]['label']
