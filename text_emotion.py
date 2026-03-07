from transformers import pipeline
import threading

# ================= LOAD MODEL ONCE =================

_model_lock = threading.Lock()
_emotion_model = None


def _load_model():
    global _emotion_model
    if _emotion_model is None:
        with _model_lock:
            if _emotion_model is None:  # double-check locking
                _emotion_model = pipeline(
                    "text-classification",
                    model="j-hartmann/emotion-english-distilroberta-base",
                    return_all_scores=False,
                )


# Load at import time (server startup)
_load_model()


# ================= EMOTION DETECTION =================

def detect_text_emotion(text: str) -> str:
    """
    Detect primary emotion from text using pretrained DistilRoBERTa model.

    Returns:
        str: emotion label
    """

    if not text or not isinstance(text, str):
        return "neutral"

    text = text.strip()

    if len(text) > 512:
        # Truncate very long inputs (model max token limit safety)
        text = text[:512]

    try:
        result = _emotion_model(text)
        return result[0]["label"]

    except Exception as e:
        print("Emotion detection error:", e)
        return "neutral"