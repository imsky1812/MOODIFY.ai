from transformers import pipeline
import threading
import torch

# ================= GLOBAL MODEL =================

_model_lock = threading.Lock()
_emotion_model = None


# ================= DEVICE DETECTION =================

def _get_device():
    """Use GPU if available, otherwise CPU."""
    try:
        return 0 if torch.cuda.is_available() else -1
    except Exception:
        return -1


# ================= LOAD MODEL =================

def _load_model():
    """
    Load emotion model once during server startup.
    Uses thread-safe lazy initialization.
    """

    global _emotion_model

    if _emotion_model is None:

        with _model_lock:

            if _emotion_model is None:

                print("🔵 Loading emotion detection model...")

                _emotion_model = pipeline(
                    task="text-classification",
                    model="j-hartmann/emotion-english-distilroberta-base",
                    device=_get_device(),
                    truncation=True
                )

                print("✅ Emotion model loaded")


# Load model immediately when module imports
_load_model()


# ================= EMOTION DETECTION =================

def detect_text_emotion(text: str) -> str:
    """
    Detect the dominant emotion in user text.

    Returns:
        str: emotion label
    """

    if not text or not isinstance(text, str):
        return "neutral"

    text = text.strip()

    # Avoid extremely long prompts
    if len(text) > 500:
        text = text[:500]

    try:

        result = _emotion_model(text)

        if not result or len(result) == 0:
            return "neutral"

        label = result[0].get("label", "neutral")

        return label.lower()

    except Exception as e:

        print("Emotion detection error:", e)

        return "neutral"