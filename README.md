# MOODIFY.ai — Multimodal AI Wellbeing Assistant

**MOODIFY.ai** is an AI-powered emotional wellbeing companion designed to help students express, understand, and manage their emotions through natural conversation.

Unlike a traditional chatbot, Moodify behaves like a supportive digital companion.
It combines **conversational AI, emotion detection, voice interaction, and real-time facial expression analysis** into a single interactive application.

---

## 🎯 Project Objective

The goal of this project is to create a human-like AI companion that:

* Provides emotionally supportive conversations
* Detects the user’s emotional state
* Encourages reflection and self-expression
* Creates a calming and engaging wellness environment
* Demonstrates real-time multimodal AI interaction

---

## 🧠 Key Features

### 💬 Conversational AI Companion

* Human-like empathetic conversations
* Context-aware responses
* Personalized interaction personality ("Moodify")

### 📊 Emotion & Wellbeing Analysis

* Text emotion detection (happy, sad, anxious, neutral)
* Real-time wellbeing score updates
* Emotion tracking during conversations

### 🎤 Voice Assistant

* Speech-to-Text interaction
* Continuous listening mode
* Text-to-Speech AI replies

### 📷 Facial Emotion Recognition

* Real-time webcam emotion detection
* On-demand camera activation
* Powered by computer vision

### 🖥️ Interactive UI

* Messaging-style chat interface
* Typing indicator animation
* Animated gradient background
* Glassmorphism design

---

## 🧰 Technology Stack

### Backend

* Python 3.10
* FastAPI
* Uvicorn Server
* Groq API (LLaMA-3.3-70B conversational model)

### Frontend

* HTML5
* CSS3 (Glassmorphism UI)
* JavaScript (DOM + Fetch API)

### AI / Machine Learning

* DeepFace
* TensorFlow
* OpenCV
* SpeechRecognition
* PyAudio
* gTTS (Text-to-Speech)
* Groq Python SDK

---

## 🏗️ System Architecture

Frontend → FastAPI Server → Emotion Detection → LLM Response → UI Display

The frontend sends user input to the FastAPI backend.
The backend analyzes emotion, sends the message to the LLM, generates a response, and updates the wellbeing score in real time. 

---

## 🔄 Application Workflow

1. AI greets the user
2. User sends a message
3. Emotion is detected from text
4. LLM generates an empathetic response
5. Wellbeing score updates
6. User can switch to voice mode
7. User can enable live camera emotion detection

---

## ⚙️ Installation & Setup

### 1️⃣ Clone the repository

```bash
git clone https://github.com/imsky1812/MOODIFY.ai.git
cd MOODIFY.ai
```

### 2️⃣ Install dependencies

```bash
pip install -r requirements.txt
```

### 3️⃣ Create `.env` file

Create a file named `.env` and add:

```
GROQ_API_KEY=your_api_key_here
```

### 4️⃣ Run the application

```bash
uvicorn app:app --reload
```

Open browser:

```
http://127.0.0.1:8000
```

---

## 🧪 Final Capabilities

* Emotional conversational AI
* Wellbeing score monitoring
* Voice interaction
* Facial emotion detection
* Dynamic UI experience
* Real-time response generation

---

## 🚧 Challenges Faced

During development several issues were encountered:

* API quota & key validation problems
* TensorFlow compatibility errors
* DeepFace model loading failures
* Audio recording format issues
* Server port conflicts

These were resolved using fallback responses, server warm-up, and improved error handling to ensure demo stability. 

---

## 📌 Conclusion

MOODIFY.ai demonstrates how AI can go beyond automation and act as a supportive digital companion.
By combining conversational intelligence, voice communication, and facial emotion recognition, the project highlights the role of human-centered AI in mental wellness and interactive computing. 

---

## 👨‍💻 Author

**Sarvesh Kumar Yadav**

---

## ⭐ Future Improvements

* Mobile app integration
* Mood history dashboard
* Music recommendation based on mood
* User accounts & personalization
* Therapy resource suggestions

---

> *Moodify is not a medical tool and is intended only for emotional support and interaction.*
