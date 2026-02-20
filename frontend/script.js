const chat = document.getElementById("chat");
const input = document.getElementById("userInput");
const scoreDisplay = document.getElementById("score");

// Add message to chat
function addMessage(text, cls){
    const div = document.createElement("div");
    div.className = cls;
    div.innerText = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

// Send text message
document.getElementById("sendBtn").onclick = async () => {

    const text = input.value.trim();
    if(!text) return;

    addMessage(text, "user");
    input.value = "";

    // --- typing indicator ---
    const typing = document.createElement("div");
    typing.className = "typing";
    typing.innerHTML = `
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
    `;
    chat.appendChild(typing);
    chat.scrollTop = chat.scrollHeight;

    try{
        const res = await fetch("/analyze-text/", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({text})
        });

        const data = await res.json();

        // remove typing animation
        typing.remove();

        addMessage(data.support_message, "bot");
        scoreDisplay.innerText = data.wellbeing_score;

    }catch{
        typing.remove();
        addMessage("I'm having trouble responding right now.", "bot");
    }
};

// Press Enter to send
input.addEventListener("keypress", function(e){
    if(e.key === "Enter"){

        const btn = document.getElementById("sendBtn");

        btn.classList.add("sendPulse");
        setTimeout(()=>btn.classList.remove("sendPulse"),400);

        btn.click();
    }
});

// CAMERA BUTTON
document.getElementById("cameraBtn").onclick = async () => {
    try{
        await fetch("/start-camera");
    }catch{}
};

// VOICE BUTTON
document.getElementById("voiceBtn").onclick = async () => {
    try{
        await fetch("/start-voice");
    }catch{}
};

// LIVE SCORE REFRESH (every 2 seconds)
async function updateScore(){
    try{
        const res = await fetch("/current-score");
        const data = await res.json();
        scoreDisplay.innerText = data.score;
    }catch{}
}

setInterval(updateScore, 2000);

const voiceModal = document.getElementById("voiceModal");
const voiceStatus = document.getElementById("voiceStatus");
const voiceIndicator = document.getElementById("voiceIndicator");

let voiceActive = false;

// open modal
document.getElementById("voiceBtn").onclick = () => {
    voiceModal.classList.remove("hidden");
};

// close modal
document.getElementById("closeVoiceBtn").onclick = async () => {
    voiceActive = false;
    voiceModal.classList.add("hidden");

    // tell backend to stop
    await fetch("/stop-voice");
};

// start voice interaction
document.getElementById("startVoiceBtn").onclick = async () => {

    voiceActive = true;

    while(voiceActive){

        voiceStatus.innerText = "🔔 Speak now...";
        await new Promise(r => setTimeout(r, 500));

        voiceStatus.innerText = "🎙 Listening...";
        voiceIndicator.classList.remove("hidden");

        const res = await fetch("/voice-cycle");
        const data = await res.json();

        voiceIndicator.classList.add("hidden");

        if(data.text){
            addMessage(data.text, "user");
        }

        if(data.reply){
            voiceStatus.innerText = "🤖 AI is responding...";
            addMessage(data.reply, "bot");
        }

        if(!voiceActive) break;
    }
};

document.addEventListener("keydown", async function(event){
    if(event.key === "q"){
        voiceActive = false;
        voiceModal.classList.add("hidden");
        await fetch("/stop-voice");
    }
});

// Welcome message when page loads
window.onload = async function(){

    try{
        const res = await fetch("/welcome");
        const data = await res.json();

        addMessage(data.message, "bot");
    }
    catch{
        addMessage("Hello! I'm Moodify. How are you feeling today?", "bot");
    }
};

// breathing effect when idle
let idleTimer;

function setIdle(){
    input.classList.add("idleGlow");
}

function resetIdle(){
    input.classList.remove("idleGlow");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(setIdle, 2500);
}

document.addEventListener("mousemove", resetIdle);
document.addEventListener("keypress", resetIdle);

resetIdle();