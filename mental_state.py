# ================= EMOTION GROUPS =================

NEGATIVE_EMOTIONS = {"sadness", "fear", "anger", "disgust"}
NEUTRAL_EMOTIONS = {"neutral"}
POSITIVE_EMOTIONS = {"joy", "happy", "surprise"}

# ================= SCORING CONSTANTS =================

BASE_SCORE = 100
NEGATIVE_IMPACT = 40
NEUTRAL_IMPACT = 15


# ================= EMOTION NORMALIZATION =================

def normalize_emotion(emotion):
    """Safely normalize emotion input."""
    
    if not emotion:
        return ""

    return str(emotion).lower().strip()


# ================= EMOTION IMPACT =================

def emotion_impact(emotion):
    """Return score reduction based on emotion."""

    if emotion in NEGATIVE_EMOTIONS:
        return NEGATIVE_IMPACT

    if emotion in NEUTRAL_EMOTIONS:
        return NEUTRAL_IMPACT

    return 0


# ================= STRESS SCORE =================

def calculate_stress_score(text_emotion, face_emotion):
    """
    Calculate combined stress score using text + face emotions.

    Base score: 100

    Negative emotion → -40
    Neutral emotion → -15
    Positive emotion → 0

    Returns:
        score (int)
        risk (str)
    """

    text_emotion = normalize_emotion(text_emotion)
    face_emotion = normalize_emotion(face_emotion)

    score = BASE_SCORE

    # Apply emotion impacts
    score -= emotion_impact(text_emotion)
    score -= emotion_impact(face_emotion)

    # Clamp score
    score = max(0, min(100, score))

    # Risk classification
    if score < 30:
        risk = "High Risk"

    elif score < 60:
        risk = "Moderate Stress"

    else:
        risk = "Healthy"

    return score, risk