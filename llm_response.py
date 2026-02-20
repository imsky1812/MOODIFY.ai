from dotenv import load_dotenv
import os
from groq import Groq

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def generate_support_message(user_text, emotion):

    system_prompt = f"""
You are MOODIFY.ai, an empathetic AI wellbeing assistant for college students.

Rules:
- Talk like a friendly human, not a doctor.
- Respond directly to the user's message.
- Do NOT mention "emotion detection" or "AI analysis".
- If the user sounds stressed, be supportive.
- If the user sounds happy, be encouraging.
Detected emotional tone (internal use only): {emotion}
"""

    chat_completion = client.chat.completions.create(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text}
        ],
        model="llama-3.3-70b-versatile",
    )

    return chat_completion.choices[0].message.content
