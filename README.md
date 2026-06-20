# 🎧 MOODIFY.ai

### AI Emotional Companion with Intelligent Music Therapy

![Python](https://img.shields.io/badge/Python-3.10-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-green?logo=fastapi)
![Spotify](https://img.shields.io/badge/Spotify-Web%20SDK-1DB954?logo=spotify)
![AI](https://img.shields.io/badge/AI-Groq%20LLM-orange)

---

# 🌌 Overview

**MOODIFY.ai** is an intelligent emotional wellbeing assistant that combines:

* 💬 empathetic AI conversation
* 🎧 mood-based music therapy
* 🎙 voice interaction
* 🎭 emotion detection

to help users **understand their feelings and improve their mood through music**.

The system blends **AI psychology principles with music recommendation** to create a supportive digital companion for students and young adults.

---

# ✨ Key Features

## 💬 AI Emotional Companion

* Natural conversation with **Groq LLM (Llama-3.3-70B)**
* Supports **English, Hindi, and Hinglish**
* Emotion-aware responses
* Friendly and supportive personality

Example interaction:

User:

```
I feel really stressed today
```

AI:

```
That sounds overwhelming. Want to talk about what's making today difficult?
Maybe we can find something relaxing together.
```

---

# 🎵 AI Music Therapy Engine

MOODIFY can control Spotify using natural language.

Example commands:

```
play kesariya
play arijit singh
play relaxing music
skip this song
pause music
```

Features:

✔ AI music understanding
✔ Spotify playback control
✔ Infinite autoplay playlist
✔ Mood-based recommendations

---

# 🧠 Wellbeing Score

MOODIFY tracks emotional trends in the conversation and calculates a **wellbeing score**.

| Score  | Meaning         |
| ------ | --------------- |
| 0–20   | Severe distress |
| 21–40  | Struggling      |
| 41–60  | Mixed emotions  |
| 61–80  | Stable          |
| 81–100 | Positive        |

The score updates dynamically as the conversation evolves.

---

# 🎭 Emotion Detection

MOODIFY understands emotions using multiple signals:

### Chat Emotion

Using **DistilRoBERTa emotion model**

### Facial Emotion

Using **DeepFace facial analysis**

### Voice Emotion

Using speech tone analysis

These signals help personalize the AI response and music suggestions.

---

# 🎙 Voice Assistant

Users can speak with MOODIFY.

Capabilities:

* Speech-to-text conversation
* AI voice replies
* Emotional conversation through voice

---

# 🎧 Spotify Mini Player

The custom Spotify mini player includes:

* Album artwork
* Play / Pause / Next / Previous
* Song progress slider
* Volume control
* Dynamic album color background
* Infinite autoplay radio

---

# 🧠 System Architecture

```
        User Interaction
       /      |       \
      /       |        \
   Text     Voice     Camera
    │         │         │
    ▼         ▼         ▼
 Emotion Detection (AI Models)
           │
           ▼
        Groq LLM
  (Conversation Intelligence)
           │
           ▼
   Music Intent Detection
           │
           ▼
    Spotify API Engine
           │
           ▼
      Smart Music Player
```

---

# 🏗 Tech Stack

### Backend

* FastAPI
* Python

### AI & Machine Learning

* Groq LLM (Llama-3.3-70B)
* HuggingFace Transformers
* DeepFace

### Frontend

* HTML
* CSS (Glassmorphism UI)
* JavaScript

### Music Integration

* Spotify Web Playback SDK
* Spotify Web API

---

# 📂 Project Structure

```
MOODIFY.ai
│
├── frontend
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── assets
│
├── backend
│   ├── main.py
│   ├── spotify_service.py
│   ├── llm_response.py
│   ├── conversation_memory.py
│   ├── text_emotion.py
│   ├── mental_state.py
│   ├── voice_assistant.py
│   ├── voice_emotion.py
│   ├── ai_voice.py
│   ├── camera_stream.py
│   └── live_face_emotion.py
│
├── requirements.txt
└── README.md
```

---

# ⚙️ Installation

Clone the repository:

```
git clone https://github.com/yourusername/moodify.ai.git
cd moodify.ai
```

Create virtual environment:

```
python -m venv venv
venv\Scripts\activate
```

Install dependencies:

```
pip install -r requirements.txt
```

---

# 🔑 Environment Variables

Create a `.env` file:

```
GROQ_API_KEY=your_groq_api_key

SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/callback
```

---

# ▶️ Run the Application

Start the FastAPI server:

```
uvicorn backend.main:app --reload
```

Open in browser:

```
http://127.0.0.1:8000
```

---

# 🚀 Future Roadmap

Planned improvements:

* AI music memory system
* Emotion-adaptive playlists
* Browser-based emotion detection
* Real-time voice conversation
* AI generated playlists

---

# ⚠️ Disclaimer

MOODIFY.ai is **not a medical or psychological service**.
It is designed as a supportive companion and should not replace professional mental health care.

---

# 👨‍💻 Author

Developed by **Sarvesh Kumar Yadav**

---

# ⭐ Support the Project

If you like this project:

⭐ Star the repository
🐛 Report bugs
🚀 Suggest improvements

Your support helps make MOODIFY.ai better.
