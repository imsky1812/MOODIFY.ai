def calculate_stress_score(text_emotion, face_emotion):

    # base score (healthy = 100)
    score = 100

    negative_emotions = ["sadness", "fear", "anger", "disgust"]
    mild_emotions = ["neutral"]
    positive_emotions = ["joy", "happy", "surprise"]

    # text impact
    if text_emotion in negative_emotions:
        score -= 40
    elif text_emotion in mild_emotions:
        score -= 15

    # face impact
    if face_emotion in negative_emotions:
        score -= 40
    elif face_emotion in mild_emotions:
        score -= 15

    # clamp score
    score = max(0, min(score, 100))

    # risk level
    if score < 30:
        risk = "High Risk"
    elif score < 60:
        risk = "Moderate Stress"
    else:
        risk = "Healthy"

    return score, risk
