/* =========================================================
   MOODIFY.ai MAIN SCRIPT
   Production Stable Version
=========================================================*/

/* ================= GLOBAL STATE ================= */

let spotifyPlayer = null
let deviceId = null
let spotifyToken = null

let trackQueue = []
let currentTrackIndex = 0
let currentMood = null

let progressInterval = null
let currentPosition = 0
let currentDuration = 0
let isPlaying = false

let searchLock = false

/* =========================================================
   PAGE INIT — stop any lingering camera session immediately
=========================================================*/
fetch("/stop-camera").catch(() => {});

// Force-hide the modal and reset any stale DOM state on load
document.addEventListener("DOMContentLoaded", () => {
    const m = document.getElementById("cameraModal");
    const v = document.getElementById("videoFeed");
    if (m) m.classList.add("hidden");
    if (v) v.src = "";
});

window.addEventListener("beforeunload", () => {
    fetch("/stop-camera").catch(() => {});
});


/* ================= DOM ELEMENTS ================= */

const chat = document.getElementById("chat")
const input = document.getElementById("userInput")
const songSlider = document.getElementById("songSlider")
const volumeSlider = document.getElementById("volumeSlider")

/* =========================================================
   SEND BUTTON
=========================================================*/
const sendBtn = document.getElementById("sendBtn");
sendBtn.classList.add("sendPulse");
setTimeout(()=>sendBtn.classList.remove("sendPulse"),300);

if(sendBtn){

    sendBtn.addEventListener("click", sendMessage);

}

/* =========================================================
   CAMERA MODAL
=========================================================*/

const cameraBtn    = document.getElementById("cameraBtn");
const cameraModal  = document.getElementById("cameraModal");
const closeCameraBtn = document.getElementById("closeCameraBtn");
const videoFeed    = document.getElementById("videoFeed");
const videoCanvas  = document.getElementById("videoCanvas");
const cameraLoading = document.getElementById("cameraLoading");

let cameraStateInterval = null;
let cameraOpen = false;
let videoStream = null;

async function openCamera() {
    if (cameraOpen) return;
    cameraOpen = true;

    cameraModal.classList.remove("hidden");
    cameraBtn.classList.add("cam-active");
    cameraLoading.classList.remove("hide");

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoFeed.srcObject = videoStream;

        videoFeed.onloadedmetadata = () => {
            cameraLoading.classList.add("hide");
            
            videoCanvas.width = videoFeed.videoWidth;
            videoCanvas.height = videoFeed.videoHeight;

            // Poll emotion state by sending frame every 2 seconds
            cameraStateInterval = setInterval(async () => {
                const ctx = videoCanvas.getContext("2d");
                ctx.drawImage(videoFeed, 0, 0, videoCanvas.width, videoCanvas.height);
                const b64_img = videoCanvas.toDataURL("image/jpeg", 0.6);

                try {
                    const res = await fetch("/analyze-frame/", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ image: b64_img })
                    });
                    
                    const data = await res.json();

                    const emotionEl   = document.getElementById("camEmotion");
                    const wellbeingEl = document.getElementById("camWellbeing");
                    const riskEl      = document.getElementById("camRisk");
                    const msgEl       = document.getElementById("camMessage");

                    if (emotionEl)   emotionEl.textContent   = data.emotion   || "--";
                    if (wellbeingEl) wellbeingEl.textContent  = data.wellbeing !== "--" ? data.wellbeing + "%" : "--";
                    if (riskEl) {
                        riskEl.textContent        = data.risk || "--";
                        riskEl.dataset.risk       = data.risk || "LOW";
                    }
                    if (msgEl && data.message)  msgEl.textContent = data.message;

                    const topScore = document.getElementById("wellbeingScore");
                    if (topScore && data.wellbeing !== "--") topScore.textContent = data.wellbeing;

                } catch(e) { console.error("Camera frame error", e); }
            }, 2000);
        };
    } catch (err) {
        cameraLoading.innerHTML = `<p>Camera access denied</p>`;
        console.error("Camera error:", err);
    }
}

function closeCamera() {
    if (!cameraOpen) return;
    cameraOpen = false;

    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    videoFeed.srcObject = null;
    
    cameraModal.classList.add("hidden");
    cameraBtn.classList.remove("cam-active");
    cameraLoading.classList.remove("hide");

    clearInterval(cameraStateInterval);
    cameraStateInterval = null;
    
    fetch("/stop-camera").catch(() => {});
}

if (cameraBtn) {
    cameraBtn.addEventListener("click", () => {
        cameraOpen ? closeCamera() : openCamera();
    });
}

if (closeCameraBtn) {
    closeCameraBtn.addEventListener("click", closeCamera);
}

if (cameraModal) {
    cameraModal.addEventListener("click", (e) => {
        if (e.target === cameraModal) closeCamera();
    });
}


/* =========================================================
   MIC BUTTON
=========================================================*/

const voiceBtn = document.getElementById("voiceBtn");
const voiceModal = document.getElementById("voiceModal");
const startVoiceBtn = document.getElementById("startVoiceBtn");
const stopVoiceBtn = document.getElementById("stopVoiceBtn");
const closeVoiceBtn = document.getElementById("closeVoiceBtn");
const voiceStatus = document.getElementById("voiceStatus");
const voiceIndicator = document.getElementById("voiceIndicator");

let isVoiceActive = false;
let mediaRecorder = null;
let audioChunks = [];

function resetVoiceUI() {
    isVoiceActive = false;
    voiceStatus.innerText = "Tap Start to Speak";
    voiceIndicator.classList.add("hidden");
    startVoiceBtn.classList.remove("hidden");
    stopVoiceBtn.classList.add("hidden");
}

async function stopVoiceSession() {
    if (!isVoiceActive) return;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    resetVoiceUI();
}

if(voiceBtn){
    voiceBtn.addEventListener("click", () => {
        voiceModal.classList.remove("hidden");
    });
}

if(closeVoiceBtn){
    closeVoiceBtn.addEventListener("click", async () => {
        await stopVoiceSession();
        voiceModal.classList.add("hidden");
    });
}

if(startVoiceBtn){
    startVoiceBtn.addEventListener("click", async () => {
        voiceStatus.innerText = "Connecting microphone...";
        startVoiceBtn.disabled = true;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            
            mediaRecorder.ondataavailable = (event) => {
                if(event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                audioChunks = []; // reset
                stream.getTracks().forEach(t => t.stop()); // close mic

                voiceStatus.innerText = "Analyzing audio...";
                
                // POST to backend
                const formData = new FormData();
                formData.append("audio", audioBlob, "voice.webm");

                try {
                    const res = await fetch("/analyze-audio/", {
                        method: "POST",
                        body: formData
                    });
                    const data = await res.json();
                    
                    if (data.text) {
                       addMessage(data.text, "user"); 
                       addMessage(data.reply, "bot");
                       
                       // Text to speech locally
                       const utterance = new SpeechSynthesisUtterance(data.reply);
                       window.speechSynthesis.speak(utterance);
                    }
                    
                    voiceStatus.innerText = "Tap Start to Speak again";
                    
                } catch(e) {
                    console.error("Audio post failed", e);
                    voiceStatus.innerText = "Network Error";
                }
            };
            
            mediaRecorder.start();

            isVoiceActive = true;
            voiceStatus.innerText = "Active. Speak now (Tap Stop when done)...";
            voiceIndicator.classList.remove("hidden");
            startVoiceBtn.classList.add("hidden");
            stopVoiceBtn.classList.remove("hidden");
            
        } catch(err) {
            console.error("Mic denied", err);
            voiceStatus.innerText = "Microphone access denied.";
        } finally {
            startVoiceBtn.disabled = false;
        }
    });
}

if(stopVoiceBtn){
    stopVoiceBtn.addEventListener("click", async () => {
        voiceStatus.innerText = "Processing...";
        stopVoiceBtn.disabled = true;
        await stopVoiceSession();
        stopVoiceBtn.disabled = false;
    });
}

/* =========================================================
   SPOTIFY SDK INIT
=========================================================*/

window.onSpotifyWebPlaybackSDKReady = function () {

    console.log("Spotify SDK Ready")

    fetch("/spotify-token")
        .then(res => res.json())
        .then(data => {

            if (!data.token || data.error) {
                console.warn("Spotify not authenticated")
                return
            }

            spotifyToken = data.token

            spotifyPlayer = new Spotify.Player({
                name: "MOODIFY Player",
                getOAuthToken: cb => cb(spotifyToken),
                volume: 0.6
            })

            spotifyPlayer.addListener("ready", ({ device_id }) => {

                deviceId = device_id

                fetch("https://api.spotify.com/v1/me/player", {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${spotifyToken}`
                    },
                    body: JSON.stringify({
                        device_ids: [deviceId],
                        play: false
                    })
                })
            })

            spotifyPlayer.addListener("player_state_changed", handlePlayerState)

            spotifyPlayer.connect()
        })
}

/* =========================================================
   PLAYER STATE
=========================================================*/

function handlePlayerState(state){

    if(!state) return

    const playBtn = document.getElementById("playPauseBtn")
    const album = document.getElementById("trackImage")
    const wrapper = document.querySelector(".spotify-wrapper")

    currentPosition = state.position
    currentDuration = state.duration

    updateProgressBar()

    if(progressInterval !== null){
        clearInterval(progressInterval)
        progressInterval = null
    }

    if(!state.paused){

        progressInterval = setInterval(()=>{

            currentPosition += 500

            if(currentPosition >= currentDuration){
                clearInterval(progressInterval)
                progressInterval = null
                return
            }

            updateProgressBar()

        },500)

    }

    isPlaying = !state.paused

    if(playBtn){
        playBtn.innerText = isPlaying ? "⏸" : "▶"
    }

    if(album && wrapper){

        if(isPlaying){
            album.classList.add("rotating")
            wrapper.classList.add("spotify-active")
            document.body.classList.add("spotify-playing")
        }else{
            album.classList.remove("rotating")
            wrapper.classList.remove("spotify-active")
            document.body.classList.remove("spotify-playing")
        }

    }

    /* AUTO NEXT */

    if(state.paused && state.position === 0){

        currentTrackIndex++

        if(currentTrackIndex >= trackQueue.length - 2){
            extendQueue()
        }

        if(currentTrackIndex < trackQueue.length){
            playTrack(trackQueue[currentTrackIndex])
        }

    }

}

/* =========================================================
   PROGRESS BAR
=========================================================*/

function updateProgressBar(){

    const currentTime = document.getElementById("currentTime")
    const totalTime = document.getElementById("totalTime")

    if(!songSlider || !currentDuration) return

    const progress = (currentPosition / currentDuration) * 100

    songSlider.value = progress

    songSlider.style.background = `linear-gradient(
        to right,
        #1db954 0%,
        #1db954 ${progress}%,
        rgba(255,255,255,0.25) ${progress}%,
        rgba(255,255,255,0.25) 100%
    )`

    if(currentTime) currentTime.innerText = formatTime(currentPosition)
    if(totalTime) totalTime.innerText = formatTime(currentDuration)

}

function formatTime(ms){

    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)

    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds

}

/* =========================================================
   SEEK
=========================================================*/

if(songSlider){

    songSlider.addEventListener("input", ()=>{

        if(!spotifyPlayer) return

        spotifyPlayer.getCurrentState().then(state=>{

            if(!state) return

            const position = (songSlider.value / 100) * state.duration

            spotifyPlayer.seek(position)

            currentPosition = position
            currentDuration = state.duration

            updateProgressBar()

        })

    })

}

/* =========================================================
   SEARCH SONG
=========================================================*/

async function searchAndPlay(){

    
    if(searchLock) return

    const searchInput = document.getElementById("musicSearch")
    if(!searchInput) return

    const query = searchInput.value.trim()

    if(!query){
        addMessage("🎧 What would you like to listen to?", "bot")
        return
    }

    try{

        searchLock = true

        const res = await fetch(`/spotify-search?query=${encodeURIComponent(query)}`)
        const tracks = await res.json()

        if(!tracks || tracks.length === 0) return

        trackQueue = tracks
        currentTrackIndex = 0

        playTrack(trackQueue[currentTrackIndex])

        input.value = ""

    }catch(err){

        console.error("Spotify search error", err)

    }finally{
        searchLock = false
    }

}

const musicSearch = document.getElementById("musicSearch")
const searchBtn = document.getElementById("searchPlayBtn");

if(searchBtn){

    searchBtn.addEventListener("click", () => {

        searchAndPlay();

    });

}

if (musicSearch) {

    musicSearch.addEventListener("keypress", function(e){

        if (e.key === "Enter") {

            e.preventDefault();

            searchAndPlay();

        }

    });

}

/* =========================================================
   PLAY TRACK
=========================================================*/

function playTrack(track){

    if(!track || !deviceId) return

    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,{
        method:"PUT",
        headers:{
            "Content-Type":"application/json",
            "Authorization":`Bearer ${spotifyToken}`
        },
        body:JSON.stringify({ uris:[track.uri] })
    })

    const album = document.getElementById("trackImage")
    const title = document.getElementById("trackTitle")
    const artist = document.getElementById("trackArtist")

    if(album){
        album.src = track.image || "/static/music.png"
        updateMiniPlayerColor(track.image)
    }

    if(title) title.innerText = track.name
    if(artist) artist.innerText = track.artist

}

/* =========================================================
   ALBUM COLOR EXTRACTION
=========================================================*/

function updateMiniPlayerColor(imageUrl){

    if(!imageUrl) return

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = imageUrl

    img.onload = function(){

        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")

        canvas.width = 50
        canvas.height = 50

        ctx.drawImage(img,0,0,50,50)

        const data = ctx.getImageData(0,0,50,50).data

        let r=0,g=0,b=0,count=0

        for(let i=0;i<data.length;i+=20){

            r+=data[i]
            g+=data[i+1]
            b+=data[i+2]
            count++

        }

        r=Math.floor(r/count)
        g=Math.floor(g/count)
        b=Math.floor(b/count)

        const miniPlayer=document.getElementById("miniPlayer")

        if(miniPlayer){

            miniPlayer.style.background=`
                linear-gradient(
                    135deg,
                    rgba(${r},${g},${b},0.45),
                    rgba(10,10,15,0.85)
                )
            `

        }

    }

}

/* =========================================================
   INFINITE RADIO
=========================================================*/

async function extendQueue(){

    if(trackQueue.length === 0) return

    const lastTrack = trackQueue[trackQueue.length-1]

    try{

        const res = await fetch(`/spotify-search?query=${encodeURIComponent(lastTrack.artist)}`)
        const newTracks = await res.json()

        if(!newTracks) return

        const existing = new Set(trackQueue.map(t=>t.uri))

        newTracks.forEach(track=>{
            if(!existing.has(track.uri)){
                trackQueue.push(track)
            }
        })

    }catch(err){
        console.log("Queue extension error",err)
    }

}

/* =========================================================
   PLAYER BUTTONS
=========================================================*/

const playBtn=document.getElementById("playPauseBtn")

if(playBtn){

    playBtn.addEventListener("click",()=>{

        if(spotifyPlayer){
            spotifyPlayer.togglePlay()
        }

    })

}

const nextBtn=document.getElementById("nextBtn")

if(nextBtn){

    nextBtn.addEventListener("click",()=>{

        if(trackQueue.length===0) return

        currentTrackIndex++

        if(currentTrackIndex>=trackQueue.length){
            currentTrackIndex=0
        }

        playTrack(trackQueue[currentTrackIndex])

    })

}

const prevBtn=document.getElementById("prevBtn")

if(prevBtn){

    prevBtn.addEventListener("click",()=>{

        if(trackQueue.length===0) return

        currentTrackIndex--

        if(currentTrackIndex<0){
            currentTrackIndex=trackQueue.length-1
        }

        playTrack(trackQueue[currentTrackIndex])

    })

}

/* =========================================================
   MINI PLAYER HOVER + CLICK OUTSIDE TO CLOSE
=========================================================*/

const spotifyIcon=document.getElementById("spotifyIcon")
const miniPlayer=document.getElementById("miniPlayer")

let closeTimer=null

function closeMiniPlayer() {
    if (closeTimer) clearTimeout(closeTimer)
    miniPlayer.classList.remove("active")
}

if(spotifyIcon && miniPlayer){

    // Open on hover
    spotifyIcon.addEventListener("mouseenter",()=>{
        miniPlayer.classList.add("active")
        if(closeTimer) clearTimeout(closeTimer)
    })

    // Keep open while hovering player
    miniPlayer.addEventListener("mouseenter",()=>{
        if(closeTimer) clearTimeout(closeTimer)
    })

    // Gentle close when mouse leaves BOTH icon & player
    spotifyIcon.addEventListener("mouseleave",()=>{
        closeTimer=setTimeout(()=>{
            if(!miniPlayer.matches(":hover")) closeMiniPlayer()
        },400)
    })

    miniPlayer.addEventListener("mouseleave",()=>{
        closeTimer=setTimeout(()=>{
            if(!spotifyIcon.matches(":hover")) closeMiniPlayer()
        },400)
    })

    // Click the icon → go to Spotify login
    spotifyIcon.addEventListener("click",(e)=>{
        e.preventDefault()
        e.stopPropagation()
        window.location.href="/spotify-login"
    })

}

// ── Click OUTSIDE closes the mini player ──
document.addEventListener("click",(e)=>{
    if(!miniPlayer || !spotifyIcon) return
    if(!miniPlayer.classList.contains("active")) return

    const clickedInside = miniPlayer.contains(e.target) || spotifyIcon.contains(e.target)
    if(!clickedInside){
        closeMiniPlayer()
    }
})


/* =========================================================
   VOLUME
=========================================================*/

if(volumeSlider){

    volumeSlider.addEventListener("input",()=>{

        const volume = volumeSlider.value/100

        if(spotifyPlayer){
            spotifyPlayer.setVolume(volume)
        }

        const progress=volumeSlider.value

        volumeSlider.style.background=`linear-gradient(
            to right,
            #1db954 0%,
            #1db954 ${progress}%,
            rgba(255,255,255,0.25) ${progress}%,
            rgba(255,255,255,0.25) 100%
        )`

    })

}

/* =========================================================
   CHAT
=========================================================*/

function addMessage(text,cls){

    if(!chat || !text) return

    const div=document.createElement("div")
    div.className=cls
    div.innerText=text

    chat.appendChild(div)

    chat.scrollTo({
        top:chat.scrollHeight,
        behavior:"smooth"
    })

}

/* =========================================================
   SEND MESSAGE
=========================================================*/

async function sendMessage(){

    if(!input) return

    const text=input.value.trim()

    if(!text) return

    addMessage(text,"user")

    input.value=""

    const typing=document.createElement("div")
    typing.className="bot-typing"
    typing.innerHTML=`<div class="thinking-dot"></div>`

    chat.appendChild(typing)

    try{

        const res=await fetch("/analyze-text/",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({text})
        })

        const data=await res.json()

        typing.remove()

        if(data.command){
            handleMusicCommand(data.command)
            return
        }

        if(data.music_query){

            document.getElementById("musicSearch").value=data.music_query
            searchAndPlay()

            addMessage("🎧 Playing music for you...","bot")
            return

        }

        addMessage(data.support_message,"bot")

        if(data.wellbeing_score !== undefined){

            const score=document.getElementById("wellbeingScore")
            if(score){
                score.innerText=data.wellbeing_score
            }

        }

        if(data.risk_level==="HIGH"){
            showEmergencyPopup()
        }

    }catch(err){

        typing.remove()
        addMessage("Something went wrong.","bot")

    }

}

/* =========================================================
   MUSIC COMMAND HANDLER
=========================================================*/

function handleMusicCommand(command){

    if(!command) return

    const parts = command.split(":")
    const value = parts[1] ? parts[1].trim() : ""

    switch(true){

        case command.startsWith("play_song"):

            document.getElementById("musicSearch").value=value
            searchAndPlay()

        break

        case command.startsWith("play_artist"):

            document.getElementById("musicSearch").value=value
            searchAndPlay()

        break

        case command.startsWith("play_mood"):

            playMoodMusic(value)

        break

        case command==="pause":

            if(spotifyPlayer) spotifyPlayer.pause()

        break

        case command==="next":

            document.getElementById("nextBtn").click()

        break

        case command==="previous":

            document.getElementById("prevBtn").click()

        break

        case command==="stop":

            if(spotifyPlayer) spotifyPlayer.pause()

        break

        case command==="volume_up":

            if(volumeSlider && spotifyPlayer){

                volumeSlider.value=Math.min(100,Number(volumeSlider.value)+10)
                spotifyPlayer.setVolume(volumeSlider.value/100)

            }

        break

        case command==="volume_down":

            if(volumeSlider && spotifyPlayer){

                volumeSlider.value=Math.max(0,Number(volumeSlider.value)-10)
                spotifyPlayer.setVolume(volumeSlider.value/100)

            }

        break

    }

}

/* =========================================================
   MOOD MUSIC
=========================================================*/

function playMoodMusic(mood){

    fetch(`/spotify-recommend?mood=${mood}`)
    .then(res=>res.json())
    .then(tracks=>{

        if(!tracks || tracks.length===0) return

        trackQueue=tracks
        currentTrackIndex=0

        playTrack(trackQueue[0])

    })

}

/* =========================================================
   ENTER KEY
=========================================================*/

if(input){

    input.addEventListener("keypress",e=>{

        if(e.key==="Enter"){
            sendMessage()
        }

    })

}

/* =========================================================
   EMERGENCY
=========================================================*/

function showEmergencyPopup(){

    const popup=document.getElementById("emergencyPopup")
    if(popup) popup.style.display="flex"

}

function closeEmergency(){

    const popup=document.getElementById("emergencyPopup")
    if(popup) popup.style.display="none"

}

/* =========================================================
   CURSOR GLOW
=========================================================*/

const glow=document.querySelector(".cursor-glow")

let mouseX=0
let mouseY=0
let currentX=0
let currentY=0

document.addEventListener("mousemove",e=>{
    mouseX=e.clientX
    mouseY=e.clientY
})

function animateGlow(){

    if(!glow) return

    currentX+=(mouseX-currentX)*0.08
    currentY+=(mouseY-currentY)*0.08

    glow.style.left=currentX+"px"
    glow.style.top=currentY+"px"

    requestAnimationFrame(animateGlow)

}

animateGlow()

/* =========================================================
   WELCOME
=========================================================*/

window.addEventListener("load",async()=>{

    try{

        const res=await fetch("/welcome")
        const data=await res.json()

        if(data.message){
            addMessage(data.message,"bot")
        }

    }catch{

        addMessage("Hello! I'm Moodify. How are you feeling today?","bot")

    }

})