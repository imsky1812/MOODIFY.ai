/* =========================================================
   MOODIFY.ai MAIN SCRIPT
   Fully optimized stable version
=========================================================*/

/* ================= Slider VARIABLES ================= */

let progressInterval = null
let currentPosition = 0
let currentDuration = 0

/* ================= SPOTIFY VARIABLES ================= */

let spotifyPlayer = null
let deviceId = null
let spotifyToken = null

let trackQueue = []
let currentTrackIndex = 0
let isPlaying = false
let currentMood = null;

/* =========================================================
   SPOTIFY SDK INITIALIZATION
=========================================================*/

window.onSpotifyWebPlaybackSDKReady = function () {

    console.log("Spotify SDK Ready")

    fetch("/spotify-token")
        .then(res => res.json())
        .then(data => {

            if (!data.token) {
                console.warn("Spotify token missing")
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
                console.log("Spotify device ready:", deviceId)

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
   PLAYER STATE LISTENER
=========================================================*/

function handlePlayerState(state){

    if(!state) return;

    const slider = document.getElementById("songSlider");
    const currentTime = document.getElementById("currentTime");
    const totalTime = document.getElementById("totalTime");
    const playBtn = document.getElementById("playPauseBtn");
    const album = document.getElementById("trackImage");
    const wrapper = document.querySelector(".spotify-wrapper");
    const body = document.body;

    /* ===== STORE POSITION ===== */

    currentPosition = state.position;
    currentDuration = state.duration;

    updateProgressBar();

    /* ===== AUTO PROGRESS UPDATE ===== */

    if(progressInterval){
        clearInterval(progressInterval);
    }

    if(!state.paused){

        progressInterval = setInterval(()=>{

            currentPosition += 500;

            if(currentPosition >= currentDuration){
                clearInterval(progressInterval);
                return;
            }

            updateProgressBar();

        },500);

    }

    /* ===== PLAY BUTTON ===== */

    isPlaying = !state.paused;

    if(playBtn){
        playBtn.innerText = isPlaying ? "⏸" : "▶";
    }

    /* ===== ALBUM ANIMATION ===== */

    if(album && wrapper){

        if(isPlaying){
            album.classList.add("rotating");
            wrapper.classList.add("spotify-active");
            document.body.classList.add("spotify-playing");
        }
        else{
            album.classList.remove("rotating");
            wrapper.classList.remove("spotify-active");
            document.body.classList.remove("spotify-playing");
        }

    }

    /* ===== AUTO NEXT TRACK ===== */

    if(state.paused && state.position === 0){

        currentTrackIndex++;

        if(currentTrackIndex >= trackQueue.length - 2){
            extendQueue();
        }
        if(currentTrackIndex < trackQueue.length){
            playTrack(trackQueue[currentTrackIndex], "left");
        }

    }

}

function updateProgressBar(){

    const slider = document.getElementById("songSlider");
    const currentTime = document.getElementById("currentTime");
    const totalTime = document.getElementById("totalTime");

    if(!slider || !currentDuration) return;

    const progress = (currentPosition / currentDuration) * 100;

    slider.value = progress;

    slider.style.background = `linear-gradient(
        to right,
        #1db954 0%,
        #1db954 ${progress}%,
        rgba(255,255,255,0.25) ${progress}%,
        rgba(255,255,255,0.25) 100%
    )`;

    if(currentTime){
        currentTime.innerText = formatTime(currentPosition);
    }

    if(totalTime){
        totalTime.innerText = formatTime(currentDuration);
    }

}

const songSlider = document.getElementById("songSlider");

if(songSlider){

    songSlider.addEventListener("input", ()=>{

        if(!spotifyPlayer) return;

        spotifyPlayer.getCurrentState().then(state=>{

            if(!state) return;

            const position = (songSlider.value / 100) * state.duration;

            spotifyPlayer.seek(position);

            currentPosition = position;
            currentDuration = state.duration;

            updateProgressBar();

        });

    });

}

function formatTime(ms){

    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);

    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;

}
/* =========================================================
   SEARCH AND PLAY
=========================================================*/

async function searchAndPlay() {

    const input = document.getElementById("musicSearch")
    if (!input) return

    const query = input.value.trim()
    if (!query) return

    try {

        const res = await fetch(`/spotify-search?query=${encodeURIComponent(query)}`)
        const tracks = await res.json()

        if (!tracks || tracks.length === 0) return

        trackQueue = tracks
        currentTrackIndex = 0

        playTrack(trackQueue[currentTrackIndex], "left")

    } catch (err) {

        console.error("Spotify search error", err)

    }
}

/* =========================================================
   PLAY TRACK
=========================================================*/

function playTrack(track, direction="left"){

    if(!track || !deviceId) return;

    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${spotifyToken}`
        },
        body: JSON.stringify({
            uris: [track.uri]
        })
    });

    /* ===== UPDATE UI ===== */

    const album = document.getElementById("trackImage");
    const title = document.getElementById("trackTitle");
    const artist = document.getElementById("trackArtist");

    if(album && track.image){
        album.src = track.image;
        updateMiniPlayerColor(track.image);
    }

    if(title){
        title.innerText = track.name;
    }

    if(artist){
        artist.innerText = track.artist;
    }

}

function updateMiniPlayerColor(imageUrl){

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;

    img.onload = function(){

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = img.width;
        canvas.height = img.height;

        ctx.drawImage(img,0,0);

        const data = ctx.getImageData(0,0,img.width,img.height).data;

        let r = 0, g = 0, b = 0, count = 0;

        for(let i=0;i<data.length;i+=40){

            r += data[i];
            g += data[i+1];
            b += data[i+2];
            count++;

        }

        r = Math.floor(r/count);
        g = Math.floor(g/count);
        b = Math.floor(b/count);

        const miniPlayer = document.getElementById("miniPlayer");

        if(miniPlayer){

            miniPlayer.style.background = `
                linear-gradient(
                    135deg,
                    rgba(${r},${g},${b},0.45),
                    rgba(10,10,15,0.85)
                )
            `;

        }

    }

}

/* =========================================================
   SPOTIFY RADIO (INFINITE AUTOPLAY)
=========================================================*/

async function extendQueue(){

    if(trackQueue.length === 0) return;

    const lastTrack = trackQueue[trackQueue.length - 1];

    try{

        const res = await fetch(`/spotify-search?query=${encodeURIComponent(lastTrack.artist)}`);
        const newTracks = await res.json();

        if(!newTracks || newTracks.length === 0) return;

        // append new songs
        trackQueue = trackQueue.concat(newTracks);

    }
    catch(err){
        console.log("Queue extension error", err);
    }

}

/* =========================================================
   PLAYER BUTTONS
=========================================================*/

const playBtn = document.getElementById("playPauseBtn")

if (playBtn) {

    playBtn.addEventListener("click", () => {

        if (!spotifyPlayer) return

        spotifyPlayer.togglePlay()

    })
}

const nextBtn = document.getElementById("nextBtn")

if (nextBtn) {

    nextBtn.addEventListener("click", () => {

        if (trackQueue.length === 0) return

        currentTrackIndex++

        if (currentTrackIndex >= trackQueue.length) {
            currentTrackIndex = 0
        }

        playTrack(trackQueue[currentTrackIndex], "left")

    })
}

const prevBtn = document.getElementById("prevBtn")

if (prevBtn) {

    prevBtn.addEventListener("click", () => {

        if (trackQueue.length === 0) return

        currentTrackIndex--

        if (currentTrackIndex < 0) {
            currentTrackIndex = trackQueue.length - 1
        }

        playTrack(trackQueue[currentTrackIndex], "right")

    })
}

/* =========================================================
   ENTER KEY SEARCH
=========================================================*/

const musicSearch = document.getElementById("musicSearch")

if (musicSearch) {

    musicSearch.addEventListener("keydown", e => {

        if (e.key === "Enter") {
            e.preventDefault()
            searchAndPlay()
        }

    })
}

/* =========================================================
   MINI PLAYER HOVER
=========================================================*/

/* =========================================================
   MINI PLAYER HOVER + SPOTIFY AUTH FIX
=========================================================*/


const spotifyIcon = document.getElementById("spotifyIcon");
const miniPlayer = document.getElementById("miniPlayer");

let closeTimer = null;

if (spotifyIcon && miniPlayer) {

    /* -------- OPEN PLAYER ON HOVER -------- */

    spotifyIcon.addEventListener("mouseenter", () => {

        miniPlayer.classList.add("active");

        if (closeTimer) {
            clearTimeout(closeTimer);
        }

    });

    /* -------- DELAY CLOSE WHEN LEAVING ICON -------- */

    spotifyIcon.addEventListener("mouseleave", () => {

        closeTimer = setTimeout(() => {

            if (!miniPlayer.matches(":hover")) {
                miniPlayer.classList.remove("active");
            }

        }, 5000);

    });

    /* -------- KEEP PLAYER OPEN WHEN HOVERING -------- */

    miniPlayer.addEventListener("mouseenter", () => {

        if (closeTimer) {
            clearTimeout(closeTimer);
        }

    });

    /* -------- CLOSE WHEN LEAVING PLAYER -------- */

    miniPlayer.addEventListener("mouseleave", () => {

        closeTimer = setTimeout(() => {

            miniPlayer.classList.remove("active");

        }, 5000);

    });

    /* -------- CLICK TO AUTHENTICATE -------- */

    spotifyIcon.addEventListener("click", function(e){

        e.preventDefault();
        e.stopPropagation();

        console.log("Spotify login clicked");

        window.location.href = "/spotify-login";

    });

}

/* =======================VOLUME SLIDER=========================*/
const volumeSlider = document.getElementById("volumeSlider");

if(volumeSlider){

    volumeSlider.addEventListener("input", () => {

        const volume = volumeSlider.value / 100;

        if(spotifyPlayer){
            spotifyPlayer.setVolume(volume);
        }

        const progress = volumeSlider.value;

        volumeSlider.style.background = `linear-gradient(
            to right,
            #1db954 0%,
            #1db954 ${progress}%,
            rgba(255,255,255,0.25) ${progress}%,
            rgba(255,255,255,0.25) 100%
        )`;

    });

}

/* =========================================================
   CHAT SYSTEM
=========================================================*/

const chat = document.getElementById("chat")
const input = document.getElementById("userInput")

function addMessage(text, cls) {

    if (!chat || !text) return

    const div = document.createElement("div")
    div.className = cls
    div.innerText = text

    chat.appendChild(div)

    chat.scrollTo({
        top: chat.scrollHeight,
        behavior: "smooth"
    })
}

/* =========================================================
   SEND MESSAGE
=========================================================*/

async function sendMessage() {
    
    if (!input) return

    const text = input.value.trim()

    if (!text) return

    addMessage(text, "user")
    input.value = ""

    const typingBubble = document.createElement("div")
    typingBubble.className = "bot-typing"
    typingBubble.innerHTML = `<div class="thinking-dot"></div>`

    chat.appendChild(typingBubble)

    try {

        const res = await fetch("/analyze-text/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        })

        const data = await res.json()

        typingBubble.remove()

        addMessage(data.support_message, "bot")

        if (data.wellbeing_score !== undefined) {

            document.getElementById("wellbeingScore").innerText = data.wellbeing_score

            let mood = "neutral"

            if (data.wellbeing_score < 40) mood = "sad"
            else if (data.wellbeing_score < 60) mood = "calm"
            else if (data.wellbeing_score < 80) mood = "neutral"
            else mood = "happy"
            
            if(currentMood !== mood){
                currentMood = mood;
                playMoodMusic(mood);
            }
        }

        if(data.command){

            handleMusicCommand(data.command);

        }

        if(data.music_query){

            document.getElementById("musicSearch").value = data.music_query
            searchAndPlay()

            addMessage("🎧 Playing music for you...", "bot")

            return
        }

        if (data.risk_level === "HIGH") {
            showEmergencyPopup()
        }

    } catch (err) {

        typingBubble.remove()
        addMessage("Something went wrong.", "bot")

    }
}

function handleMusicCommand(command){

    if(command.startsWith("play_song")){

        const song = command.split(":")[1].trim();
        document.getElementById("musicSearch").value = song;
        searchAndPlay();

    }

    if(command.startsWith("play_artist")){

        const artist = command.split(":")[1].trim();
        document.getElementById("musicSearch").value = artist;
        searchAndPlay();

    }

    if(command.startsWith("play_mood")){

        const mood = command.split(":")[1].trim();
        playMoodMusic(mood);

    }

    if(command === "pause"){
        spotifyPlayer.pause();
    }

    if(command === "next"){
        document.getElementById("nextBtn").click();
    }

    if(command === "previous"){
        document.getElementById("prevBtn").click();
    }

    if(command === "stop"){
        spotifyPlayer.pause();
    }

    if(command === "volume_up"){

        const volumeSlider = document.getElementById("volumeSlider");
        volumeSlider.value = Math.min(100, Number(volumeSlider.value) + 10);
        spotifyPlayer.setVolume(volumeSlider.value / 100);

    }

    if(command === "volume_down"){

        const volumeSlider = document.getElementById("volumeSlider");
        volumeSlider.value = Math.max(0, Number(volumeSlider.value) - 10);
        spotifyPlayer.setVolume(volumeSlider.value / 100);

    }

}


/* =========================================================
   ENTER CHAT MESSAGE
=========================================================*/

if (input) {

    input.addEventListener("keypress", e => {

        if (e.key === "Enter") sendMessage()

    })
}

/* =========================================================
   MOOD MUSIC
=========================================================*/

function playMoodMusic(mood){

    fetch(`/spotify-recommend?mood=${mood}`)
    .then(res => res.json())
    .then(tracks => {

        if(!tracks || tracks.length === 0) return;

        trackQueue = tracks;
        currentTrackIndex = 0;

        playTrack(trackQueue[currentTrackIndex]);

    });
}

/* =========================================================
   EMERGENCY POPUP
=========================================================*/

function showEmergencyPopup() {

    const popup = document.getElementById("emergencyPopup")

    if (popup) popup.style.display = "flex"
}

function closeEmergency() {

    const popup = document.getElementById("emergencyPopup")

    if (popup) popup.style.display = "none"
}

/* =========================================================
   CURSOR LIGHT EFFECT
=========================================================*/

const glow = document.querySelector(".cursor-glow")

let mouseX = 0
let mouseY = 0
let currentX = 0
let currentY = 0

document.addEventListener("mousemove", e => {

    mouseX = e.clientX
    mouseY = e.clientY
})

function animateGlow() {

    if (!glow) return

    currentX += (mouseX - currentX) * 0.08
    currentY += (mouseY - currentY) * 0.08

    glow.style.left = currentX + "px"
    glow.style.top = currentY + "px"

    requestAnimationFrame(animateGlow)
}

animateGlow()

/* =========================================================
   HARD REFRESH
=========================================================*/

const refreshBtn = document.getElementById("refreshApp")

if (refreshBtn) {

    refreshBtn.addEventListener("click", () => {

        window.location.href = "/"

    })
}

// WELCOME MESSAGE

window.addEventListener("load", async () => {

    try{
        const res = await fetch("/welcome");
        const data = await res.json();

        if(data.message){
            addMessage(data.message, "bot");
        }

    }catch{
        addMessage("Hello! I'm Moodify. How are you feeling today?", "bot");
    }

    try{
        const res = await fetch("/initial-score");
        const data = await res.json();

        const score = document.getElementById("wellbeingScore");
        if(score){
            score.innerText = data.wellbeing_score;
        }

    }catch{}
});