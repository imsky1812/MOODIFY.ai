def calculate_stress_score(text_emotion, face_emotion):
    """
    Calculate combined stress score based on text and facial emotions.

    Base score = 100
    Negative emotions reduce score by 40
    Neutral reduces score by 15
    Positive emotions do not reduce score

    Returns:
        score (int): 0–100
        risk (str): Risk category
    """

    # Normalize input safely
    text_emotion = (text_emotion or "").lower()
    face_emotion = (face_emotion or "").lower()

    # Base score (healthy = 100)
    score = 100

    NEGATIVE_EMOTIONS = {"sadness", "fear", "anger", "disgust"}
    MILD_EMOTIONS = {"neutral"}
    POSITIVE_EMOTIONS = {"joy", "happy", "surprise"}  # kept for clarity

    def apply_emotion_impact(emotion):
        nonlocal score
        if emotion in NEGATIVE_EMOTIONS:
            score -= 40
        elif emotion in MILD_EMOTIONS:
            score -= 15
        # Positive emotions intentionally reduce nothing (same behavior)

    # Apply impacts
    apply_emotion_impact(text_emotion)
    apply_emotion_impact(face_emotion)

    # Clamp score safely
    score = max(0, min(score, 100))

    # Determine risk level (same thresholds)
    if score < 30:
        risk = "High Risk"
    elif score < 60:
        risk = "Moderate Stress"
    else:
        risk = "Healthy"

    return score, risk