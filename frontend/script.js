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

// Auth State
let isAuthenticated = false;
let googleClientId = "";
let isWelcomeGreeted = false;
window.currentMistColor = null;
let hasAutoPlayedInitial = false;
let isAutoPlayingWellbeing = true;

/* =========================================================
   AUTHENTICATION & LOCK SCREEN TRANSITION
=========================================================*/

async function checkAuthStatus() {
    try {
        const res = await fetch("/api/auth/status");
        const data = await res.json();
        
        googleClientId = data.google_client_id || "";
        
        if (data.logged_in) {
            isAuthenticated = true;
            updateAuthUI(data.user);
            // Skip slide animation on reload so it's instantaneous
            const landing = document.getElementById("landingPage");
            if (landing) {
                landing.style.transition = "none";
                landing.classList.add("slide-up-exit");
            }
            initCompanion();
        } else {
            isAuthenticated = false;
            updateAuthUI(null);
            initGoogleAuth();
        }
    } catch (e) {
        console.error("Auth status check failed:", e);
        isAuthenticated = false;
        updateAuthUI(null);
    }
}

function initGoogleAuth() {
    if (!googleClientId) {
        console.warn("No GOOGLE_CLIENT_ID configured in backend.");
        const container = document.getElementById("googleBtnContainer");
        if (container) {
            container.innerHTML = `<span class="text-[10px] text-on-surface-variant/50">Unconfigured</span>`;
        }
        return;
    }
    
    try {
        if (typeof google === "undefined" || !google.accounts) {
            setTimeout(initGoogleAuth, 500);
            return;
        }
        
        google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleCredentialResponse
        });
        
        google.accounts.id.renderButton(
            document.getElementById("googleBtnContainer"),
            {
                theme: "filled_black",
                size: "medium",
                shape: "pill",
                text: "signin_with"
            }
        );
    } catch (err) {
        console.error("Failed to initialize Google Identity Services:", err);
    }
}

async function handleCredentialResponse(response) {
    try {
        const res = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: response.credential })
        });
        
        if (res.ok) {
            const data = await res.json();
            isAuthenticated = true;
            showToast(`Logged in successfully! Welcome, ${data.user.name}`);
            updateAuthUI(data.user);
            
            const promptMsg = document.getElementById("authPromptMsg");
            if (promptMsg) {
                promptMsg.innerHTML = `<span class="text-green-400 font-bold">✓ UNLOCKED</span>. Press Spacebar or click Let's Start to begin!`;
            }
            const lockIcon = document.getElementById("lockStatusIcon");
            if (lockIcon) {
                lockIcon.textContent = "lock_open";
                lockIcon.classList.add("text-green-400");
            }
            
            initCompanion();
        } else {
            showToast("Google authentication failed.");
        }
    } catch (err) {
        console.error("Login verification request failed:", err);
        showToast("Server error during login.");
    }
}

function updateAuthUI(user) {
    const authContainer = document.getElementById("googleHeaderBtn");
    if (!authContainer) return;
    
    if (user) {
        authContainer.innerHTML = `
            <div class="flex items-center gap-2 bg-surface-container/60 border border-white/5 px-4 py-1.5 rounded-full text-xs text-on-surface">
                <span class="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot"></span>
                <span class="font-semibold tracking-wide">Secure Session</span>
            </div>
        `;
        
        // Update the dashboard avatar styling if authenticated
        const avatarBtn = document.getElementById("avatarLogoutBtn");
        if (avatarBtn) {
            avatarBtn.title = `Signed in as ${user.name}. Click to Logout.`;
            if (user.picture) {
                avatarBtn.innerHTML = `<img src="${user.picture}" alt="${user.name}" class="w-full h-full object-cover">`;
            } else {
                avatarBtn.innerHTML = `<span class="material-symbols-outlined text-green-400">person</span>`;
            }
        }
    } else {
        authContainer.innerHTML = `
            <div id="googleBtnContainer" class="scale-90 hover:scale-95 transition-transform duration-200"></div>
        `;
        
        // Reset dashboard avatar
        const avatarBtn = document.getElementById("avatarLogoutBtn");
        if (avatarBtn) {
            avatarBtn.title = "Sign Out from Moodify";
            avatarBtn.innerHTML = `<span class="material-symbols-outlined text-on-surface-variant/80">person</span>`;
        }
    }
}

async function logout() {
    try {
        await fetch("/api/auth/logout", { method: "POST" });
        isAuthenticated = false;
        hasAutoPlayedInitial = false;
        isAutoPlayingWellbeing = true;
        showToast("Signed out successfully.");
        
        const landing = document.getElementById("landingPage");
        if (landing) {
            landing.style.transition = ""; 
            landing.classList.remove("slide-up-exit");
        }
        
        const lockIcon = document.getElementById("lockStatusIcon");
        if (lockIcon) {
            lockIcon.textContent = "lock";
            lockIcon.classList.remove("text-green-400");
        }
        
        const promptMsg = document.getElementById("authPromptMsg");
        if (promptMsg) {
            promptMsg.innerHTML = `Please Sign In in the header first`;
        }
        
        updateAuthUI(null);
        initGoogleAuth();
    } catch (e) {
        console.error("Logout failed:", e);
    }
}

function triggerSlideUp() {
    if (!isAuthenticated) {
        const btn = document.getElementById("letsStartBtn");
        const lock = document.getElementById("lockStatusIcon");
        if (btn) btn.classList.add("auth-warning");
        if (lock) lock.classList.add("auth-warning");
        showToast("Please sign in with Google in the header to unlock the companion.");
        setTimeout(() => {
            if (btn) btn.classList.remove("auth-warning");
            if (lock) lock.classList.remove("auth-warning");
        }, 450);
        return;
    }
    
    const landing = document.getElementById("landingPage");
    if (landing) {
        landing.style.transition = ""; 
        landing.classList.add("slide-up-exit");
        showToast("Companion unlocked. Elevating resonance levels...");
        // Trigger welcome greetings once entered
        if (!isWelcomeGreeted) {
            welcomeUser();
            isWelcomeGreeted = true;
        }
        checkAndAutoPlay();
    }
}

function initCompanion() {
    if (typeof fetchSpotifyToken === "function") {
        fetchSpotifyToken();
    }
}

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

    // Check Authentication Status
    checkAuthStatus();

    // Attach Start transition listener
    const startBtn = document.getElementById("letsStartBtn");
    if (startBtn) {
        startBtn.addEventListener("click", triggerSlideUp);
    }

    // Avatar Logout click listener
    const avatarBtn = document.getElementById("avatarLogoutBtn");
    if (avatarBtn) {
        avatarBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to sign out from Moodify?")) {
                logout();
            }
        });
    }

    // Spacebar listener for slide up transition
    window.addEventListener("keydown", (e) => {
        if (e.code === "Space" || e.keyCode === 32) {
            const active = document.activeElement;
            if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
                return;
            }
            const landing = document.getElementById("landingPage");
            if (landing && !landing.classList.contains("slide-up-exit")) {
                e.preventDefault();
                triggerSlideUp();
            }
        }
    });

    // About Sliding Panel Listeners
    const heroAboutBtn = document.getElementById("heroAboutBtn");
    const aboutPanel = document.getElementById("aboutPanel");
    const closeAboutBtn = document.getElementById("closeAboutBtn");

    if (heroAboutBtn && aboutPanel) {
        heroAboutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            aboutPanel.classList.remove("translate-x-full");
        });
    }

    if (closeAboutBtn && aboutPanel) {
        closeAboutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            aboutPanel.classList.add("translate-x-full");
        });
    }

    document.addEventListener("click", (e) => {
        if (aboutPanel && !aboutPanel.classList.contains("translate-x-full")) {
            if (!aboutPanel.contains(e.target) && e.target !== heroAboutBtn && !heroAboutBtn.contains(e.target)) {
                aboutPanel.classList.add("translate-x-full");
            }
        }
    });

    // Random Quotes Ticker for Header
    const quotes = [
        "Music is the shorthand of emotion",
        "Where words fail, music speaks",
        "Music can heal what words cannot",
        "One good thing about music, when it hits you, you feel no pain",
        "Mental health is not a destination, but a process",
        "Music has the ability to take people out of themselves",
        "Music washes away from the soul the dust of everyday life",
        "Music is the medicine of the mind",
        "To heal is to touch with love that which we previously touched with fear",
        "Beautiful music is the art of the prophets that can calm the agitations of the soul",
        "Sound waves stimulate autonomic harmony",
        "Acoustic frequency regulates stress hormones"
    ];

    const selected = [];
    const pool = [...quotes];
    for (let i = 0; i < 5; i++) {
        if (pool.length === 0) break;
        const idx = Math.floor(Math.random() * pool.length);
        selected.push(pool.splice(idx, 1)[0]);
    }

    const quoteString = selected.join("  //  ") + "  //  ";
    const ticker = document.getElementById("headerQuotesTicker");
    if (ticker) {
        // Set double string for infinite seamless horizontal marquee
        ticker.textContent = quoteString + quoteString;
    }
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
const stopVoiceBtn = document.getElementById("stopVoiceBtn"); // Hidden dummy for legacy compatibility
const closeVoiceBtn = document.getElementById("closeVoiceBtn");
const voiceStatus = document.getElementById("voiceStatus");
const siriOrb = document.getElementById("siriOrb");
const voiceVisualizer = document.getElementById("voiceVisualizer");

let isVoiceActive = false;
let isProcessingAudio = false;
let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyser = null;
let microphone = null;
let vadTimer = null;
let vadSilenceTimer = null;
let micStream = null;

function resetVoiceUI() {
    isVoiceActive = false;
    isProcessingAudio = false;
    voiceStatus.innerText = "Tap Start to activate microphone";
    if (voiceVisualizer) voiceVisualizer.classList.add("hidden");
    if (startVoiceBtn) startVoiceBtn.classList.remove("hidden");
    if (siriOrb) siriOrb.classList.remove("listening");
}

async function stopVoiceSession() {
    if (vadTimer) cancelAnimationFrame(vadTimer);
    if (vadSilenceTimer) clearTimeout(vadSilenceTimer);
    
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    
    if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
    }
    resetVoiceUI();
}

async function processAudioRecording() {
    isProcessingAudio = true;
    isVoiceActive = false;
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    audioChunks = [];
    
    const formData = new FormData();
    formData.append("audio", audioBlob, "voice.webm");

    try {
        const res = await fetch("/analyze-audio/", { method: "POST", body: formData });
        const data = await res.json();
        
        if (data.text) {
           addMessage(data.text, "user"); 
        }
        if (data.reply) {
           addMessage(data.reply, "bot");

           if(data.command){
               handleMusicCommand(data.command)
           } else if(data.music_query){
               const musicSearchEl = document.getElementById("musicSearch")
               if(musicSearchEl){
                   musicSearchEl.value=data.music_query
               }
               searchAndPlay()
           }
           
           if (data.audio_b64) {
               const audio = new Audio("data:audio/mp3;base64," + data.audio_b64);
               audio.onended = () => { isProcessingAudio = false; voiceStatus.innerText = "Speak when ready..."; };
               audio.play().catch(e => { console.error("Audio playback failed:", e); isProcessingAudio = false; voiceStatus.innerText = "Speak when ready..."; });
           } else {
               const utterance = new SpeechSynthesisUtterance(data.reply);
               utterance.onend = () => { isProcessingAudio = false; voiceStatus.innerText = "Speak when ready..."; };
               window.speechSynthesis.speak(utterance);
           }
        } else {
            isProcessingAudio = false;
            voiceStatus.innerText = "Speak when ready...";
        }
    } catch(e) {
        console.error("Audio post failed", e);
        voiceStatus.innerText = "Network Error";
        isProcessingAudio = false;
    }
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
        voiceStatus.innerText = "Initializing AI Voice...";
        startVoiceBtn.disabled = true;

        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(micStream);
            microphone.connect(analyser);
            analyser.fftSize = 512;
            
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            
            let isUserSpeaking = false;
            
            function detectSilence() {
                if(voiceModal.classList.contains("hidden")) return;
                vadTimer = requestAnimationFrame(detectSilence);
                
                if (isProcessingAudio) return;

                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for(let i=0; i<bufferLength; i++) sum += dataArray[i];
                let average = sum / bufferLength;
                
                if (average > 15) {
                    if (!isUserSpeaking) {
                        isUserSpeaking = true;
                        siriOrb.classList.add("listening");
                        voiceStatus.innerText = "Listening...";
                        
                        if(!isVoiceActive || (mediaRecorder && mediaRecorder.state === "inactive")) {
                            audioChunks = [];
                            mediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm' });
                            mediaRecorder.ondataavailable = (e) => { if(e.data.size > 0) audioChunks.push(e.data); };
                            mediaRecorder.onstop = processAudioRecording;
                            mediaRecorder.start();
                            isVoiceActive = true;
                        }
                    }
                    if(vadSilenceTimer) {
                        clearTimeout(vadSilenceTimer);
                        vadSilenceTimer = null;
                    }
                } else {
                    if (isUserSpeaking) {
                        if(!vadSilenceTimer) {
                            vadSilenceTimer = setTimeout(() => {
                                isUserSpeaking = false;
                                siriOrb.classList.remove("listening");
                                voiceStatus.innerText = "Processing...";
                                
                                if(isVoiceActive && mediaRecorder && mediaRecorder.state !== "inactive") {
                                    mediaRecorder.stop();
                                }
                            }, 1500);
                        }
                    }
                }
            }
            
            startVoiceBtn.classList.add("hidden");
            if (voiceVisualizer) voiceVisualizer.classList.remove("hidden");
            voiceStatus.innerText = "Speak when ready...";
            detectSilence();
            
        } catch(err) {
            console.error("Mic denied", err);
            voiceStatus.innerText = "Microphone access denied.";
            startVoiceBtn.classList.remove("hidden");
        } finally {
            startVoiceBtn.disabled = false;
        }
    });
}

/* =========================================================
   SPOTIFY SDK INIT & TOKEN FETCHING
=========================================================*/

function fetchSpotifyToken() {
    fetch("/spotify-token")
        .then(res => {
            if (res.status === 401) {
                console.warn("Spotify token unauthorized");
                return { error: "unauthorized" };
            }
            return res.json();
        })
        .then(data => {
            if (!data || !data.token || data.error) {
                console.warn("Spotify not authenticated");
                showSpotifyFallback();
                return;
            }

            spotifyToken = data.token;

            if (!spotifyPlayer) {
                spotifyPlayer = new Spotify.Player({
                    name: "MOODIFY Player",
                    getOAuthToken: cb => cb(spotifyToken),
                    volume: 0.6
                });

                spotifyPlayer.addListener("ready", ({ device_id }) => {
                    deviceId = device_id;

                    const fallback = document.getElementById("spotifyFallback");
                    const connectedBadge = document.getElementById("spotifyConnectedBadge");
                    const sidebarSpotifyLink = document.getElementById("sidebarSpotifyLink");
                    const sidebarSpotifyText = document.getElementById("sidebarSpotifyText");

                    if (fallback) fallback.classList.add("hidden");
                    if (connectedBadge) connectedBadge.classList.remove("hidden");
                    if (sidebarSpotifyLink) {
                        sidebarSpotifyLink.removeAttribute("href");
                        sidebarSpotifyLink.classList.add("text-white");
                        sidebarSpotifyLink.classList.remove("text-on-surface-variant");
                    }
                    if (sidebarSpotifyText) sidebarSpotifyText.textContent = "Spotify Connected";

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
                    }).then(() => {
                        checkAndAutoPlay();
                    }).catch(e => {
                        console.error("Error setting active Spotify device:", e);
                        checkAndAutoPlay();
                    });
                });

                spotifyPlayer.addListener("player_state_changed", handlePlayerState);
                spotifyPlayer.connect();
            }
        }).catch(err => {
            console.error("Error fetching Spotify token:", err);
            showSpotifyFallback();
        });
}

window.onSpotifyWebPlaybackSDKReady = function () {
    console.log("Spotify SDK Ready");
    if (isAuthenticated) {
        fetchSpotifyToken();
    }
};

/* =========================================================
   PLAYER STATE
=========================================================*/

function handlePlayerState(state){

    if(!state) return

    const playBtn = document.getElementById("playPauseBtn")
    const playIcon = document.getElementById("playPauseIcon")
    const album = document.getElementById("trackImage")
    const wrapper = document.querySelector(".spotify-wrapper")

    // ── Extract track info from SDK state ──
    const currentTrack = state.track_window && state.track_window.current_track
    if (currentTrack) {
        const title = document.getElementById("trackTitle")
        const artist = document.getElementById("trackArtist")

        if (album && currentTrack.album && currentTrack.album.images && currentTrack.album.images.length > 0) {
            const url = currentTrack.album.images[0].url;
            album.src = url;
            extractAlbumColor(url);
        }
        if (title) title.innerText = currentTrack.name || "No song playing"
        if (artist) artist.innerText = (currentTrack.artists && currentTrack.artists[0]) ? currentTrack.artists[0].name : "Moodify Player"
    }

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

    if(playIcon){
        playIcon.textContent = isPlaying ? "pause" : "play_arrow"
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

    if(state.paused && state.position === 0 && state.track_window && state.track_window.current_track){
        const trackId = state.track_window.current_track.id || state.track_window.current_track.uri;
        if (trackId && window.lastHandledEndedTrackId !== trackId) {
            window.lastHandledEndedTrackId = trackId;

            if (isAutoPlayingWellbeing) {
                playWellbeingSong();
            } else {
                currentTrackIndex++
                if(currentTrackIndex >= trackQueue.length - 2){
                    extendQueue()
                }
                if(currentTrackIndex >= trackQueue.length){
                    isAutoPlayingWellbeing = true;
                    playWellbeingSong();
                } else {
                    playTrack(trackQueue[currentTrackIndex])
                }
            }
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
        #ffffff 0%,
        #ffffff ${progress}%,
        rgba(255,255,255,0.15) ${progress}%,
        rgba(255,255,255,0.15) 100%
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

    if(!spotifyToken) {
        showSpotifyFallback();
        const miniPlayer = document.getElementById("miniPlayer");
        if(miniPlayer) miniPlayer.classList.add("active");
        return;
    }

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

        isAutoPlayingWellbeing = false;

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
        album.src = track.image || "/static/music.png";
        if (track.image) {
            extractAlbumColor(track.image);
        } else {
            window.currentMistColor = null;
        }
    }

    if(title) title.innerText = track.name
    if(artist) artist.innerText = track.artist

}

/* =========================================================
   ALBUM COLOR EXTRACTION — DISABLED
   Removed to preserve monochromatic obsidian-white theme.
   Player panel uses pure glass-panel styling from CSS.
=========================================================*/

function updateMiniPlayerColor(imageUrl){
    // Clear any stale inline background from previous sessions
    const mp = document.getElementById("miniPlayer")
    if(mp) mp.style.background = ""
}

function extractAlbumColor(imageUrl) {
    if (!imageUrl) return;

    // Fallback to white if it's a default static image
    if (imageUrl.includes("music.png") || imageUrl.includes("logo.png")) {
        window.currentMistColor = null;
        return;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = function() {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.drawImage(img, 0, 0, 1, 1);
            try {
                const imgData = ctx.getImageData(0, 0, 1, 1).data;
                window.currentMistColor = {
                    r: imgData[0],
                    g: imgData[1],
                    b: imgData[2]
                };
            } catch (e) {
                console.warn("Could not extract image data:", e);
            }
        }
    };
    img.onerror = function() {
        console.warn("Failed to load image for color extraction:", img.src);
    };
    
    // Append a unique cache-buster string to bypass browser cache non-CORS headers
    const separator = imageUrl.indexOf('?') >= 0 ? '&' : '?';
    img.src = imageUrl + separator + "cachebust=" + Math.random().toString(36).substr(2, 5);
}

/* =========================================================
   SPOTIFY AUTO-PLAY & WELLBEING ALIGNMENT
=========================================================*/

function checkAndAutoPlay() {
    if (hasAutoPlayedInitial) return;
    if (!isAuthenticated) return;
    if (!deviceId || !spotifyToken) return;

    // Check if landing page has been exited (companion started)
    const landing = document.getElementById("landingPage");
    if (landing && landing.classList.contains("slide-up-exit")) {
        hasAutoPlayedInitial = true;
        playInitialAutoSong();
    }
}

async function playInitialAutoSong() {
    isAutoPlayingWellbeing = true;
    try {
        const query = "calm acoustic instrumental";
        const res = await fetch(`/spotify-search?query=${encodeURIComponent(query)}`);
        const tracks = await res.json();
        if (tracks && tracks.length > 0) {
            // Pick a random track from the search results
            const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
            
            // Set the queue to contain just this track initially
            trackQueue = [randomTrack];
            currentTrackIndex = 0;
            
            playTrack(randomTrack);
            showToast("Playing calm acoustic music...");
        } else {
            console.warn("No calm acoustic tracks found on search.");
        }
    } catch (err) {
        console.error("Error playing initial auto song:", err);
    }
}

async function playWellbeingSong() {
    // Get current wellbeing score
    let score = 50;
    const scoreEl = document.getElementById("wellbeingScore");
    if (scoreEl) {
        const val = parseInt(scoreEl.textContent);
        if (!isNaN(val)) {
            score = val;
        }
    }
    
    // Map score to query (all must be calm acoustic instrumental but with vibe matched to score)
    let query = "calm acoustic instrumental";
    if (score < 45) {
        query = "sad acoustic instrumental";
    } else if (score > 75) {
        query = "happy acoustic instrumental";
    }
    
    try {
        const res = await fetch(`/spotify-search?query=${encodeURIComponent(query)}`);
        const tracks = await res.json();
        if (tracks && tracks.length > 0) {
            // Pick a random track from the search results
            const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
            
            trackQueue = [randomTrack];
            currentTrackIndex = 0;
            
            playTrack(randomTrack);
            showToast(`Adjusting vibe to wellbeing score: ${score}%`);
        }
    } catch (err) {
        console.error("Error playing wellbeing song:", err);
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

        if (isAutoPlayingWellbeing) {
            playWellbeingSong();
            return;
        }

        if(trackQueue.length===0) {
            if(spotifyPlayer) spotifyPlayer.nextTrack()
            return
        }

        currentTrackIndex++

        if(currentTrackIndex>=trackQueue.length){
            isAutoPlayingWellbeing = true;
            playWellbeingSong();
        } else {
            playTrack(trackQueue[currentTrackIndex])
        }

    })

}

const prevBtn=document.getElementById("prevBtn")

if(prevBtn){

    prevBtn.addEventListener("click",()=>{

        if (isAutoPlayingWellbeing) {
            if(spotifyPlayer) spotifyPlayer.seek(0)
            return
        }

        if(trackQueue.length===0) {
            if(spotifyPlayer) spotifyPlayer.previousTrack()
            return
        }

        currentTrackIndex--

        if(currentTrackIndex<0){
            currentTrackIndex=trackQueue.length-1
        }

        playTrack(trackQueue[currentTrackIndex])

    })

}

const spotifyIcon=document.getElementById("spotifyIcon")
const miniPlayer=document.getElementById("miniPlayer")
const navPlayerToggle=document.getElementById("navPlayerToggle")

function closeMiniPlayer() {
    if (miniPlayer) miniPlayer.classList.remove("active")
}

if(miniPlayer) {
    if(spotifyIcon) {
        spotifyIcon.addEventListener("click",(e)=>{
            e.preventDefault()
            e.stopPropagation()
            miniPlayer.classList.toggle("active")
        })
    }
    if(navPlayerToggle) {
        navPlayerToggle.addEventListener("click",(e)=>{
            e.preventDefault()
            e.stopPropagation()
            miniPlayer.classList.toggle("active")
        })
    }
}

// ── Click OUTSIDE closes the mini player ──
document.addEventListener("click",(e)=>{
    if(!miniPlayer) return
    if(!miniPlayer.classList.contains("active")) return

    const clickedInside = miniPlayer.contains(e.target) || 
                          (spotifyIcon && spotifyIcon.contains(e.target)) ||
                          (navPlayerToggle && navPlayerToggle.contains(e.target))
    if(!clickedInside){
        closeMiniPlayer()
    }
})

// ── Mobile Menu Toggle Logic ──
const menuToggleBtn = document.getElementById("menuToggleBtn");
const sidebarNav = document.getElementById("sidebarNav");

if (menuToggleBtn && sidebarNav) {
    menuToggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        sidebarNav.classList.toggle("active");
    });

    document.addEventListener("click", (e) => {
        if (!sidebarNav.classList.contains("active")) return;
        const clickedInside = sidebarNav.contains(e.target) || menuToggleBtn.contains(e.target);
        if (!clickedInside) {
            sidebarNav.classList.remove("active");
        }
    });
}



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
            #ffffff 0%,
            #ffffff ${progress}%,
            rgba(255,255,255,0.15) ${progress}%,
            rgba(255,255,255,0.15) 100%
        )`

    })

}

/* =========================================================
   CHAT
=========================================================*/

function addMessage(text,cls){

    if(!chat || !text) return

    const emptyState = document.getElementById("emptyState");
    if(emptyState) emptyState.remove();

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

        if(data.support_message){
            addMessage(data.support_message,"bot")
        }

        if(data.command){
            handleMusicCommand(data.command)
        } else if(data.music_query){
            const musicSearchEl = document.getElementById("musicSearch")
            if(musicSearchEl){
                musicSearchEl.value=data.music_query
            }
            searchAndPlay()
            if(!data.support_message){
                addMessage("🎧 Playing music for you...","bot")
            }
        }

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

    isAutoPlayingWellbeing = false;

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
   WHITE ASH / MIST CURSOR PARTICLES
   Subtle ambient mist following the cursor.
   Respects prefers-reduced-motion per impeccable guidelines.
=========================================================*/

(function initAshParticles() {

    // Respect reduced-motion preference
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (motionQuery.matches) return

    const canvas = document.getElementById("ashCanvas")
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let mouseX = -100
    let mouseY = -100
    let particles = []
    const MAX_PARTICLES = 400

    function resize() {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
    }

    window.addEventListener("resize", resize)
    resize()

    // Pre-populate particles to have mist immediately on load
    for (let i = 0; i < MAX_PARTICLES * 0.6; i++) {
        const size = 4 + Math.random() * 8
        const life = 350 + Math.random() * 250
        const progress = Math.random()
        const vx = (Math.random() - 0.5) * 0.4
        const vy = -0.5 - Math.random() * 0.8
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: vx,
            vy: vy,
            speed: Math.hypot(vx, vy),
            size: size,
            maxLife: life,
            life: life * progress,
            opacity: 0.04 + Math.random() * 0.06,
            hit: false
        })
    }

    const cursorDot = document.getElementById("customCursorDot")

    document.addEventListener("mousemove", e => {
        mouseX = e.clientX
        mouseY = e.clientY
        if (cursorDot) {
            cursorDot.style.left = e.clientX + "px"
            cursorDot.style.top = e.clientY + "px"
            cursorDot.style.display = "block"
        }
    })

    // Hover scaling for clickable elements
    document.addEventListener("mouseover", (e) => {
        const target = e.target;
        if (!target) return;
        
        const isClickable = target.closest("button, a, input[type='submit'], input[type='button'], [role='button'], .cursor-pointer, #spotifyIcon, #avatarLogoutBtn, .iconBtn") || 
                            (window.getComputedStyle(target).cursor === "pointer");
        
        if (isClickable && cursorDot) {
            cursorDot.classList.add("cursor-hover");
        }
    });

    document.addEventListener("mouseout", (e) => {
        const related = e.relatedTarget;
        if (cursorDot) {
            const isRelatedClickable = related && (
                related.closest("button, a, input[type='submit'], input[type='button'], [role='button'], .cursor-pointer, #spotifyIcon, #avatarLogoutBtn, .iconBtn") ||
                (window.getComputedStyle(related).cursor === "pointer")
            );
            if (!isRelatedClickable) {
                cursorDot.classList.remove("cursor-hover");
            }
        }
    });

    // Hide particles when cursor leaves window
    document.addEventListener("mouseleave", () => {
        mouseX = -100
        mouseY = -100
        if (cursorDot) {
            cursorDot.style.display = "none"
            cursorDot.classList.remove("cursor-hover");
        }
    })

    function spawnParticle() {
        if (particles.length >= MAX_PARTICLES) return

        const size = 4 + Math.random() * 8
        const life = 350 + Math.random() * 250
        const vx = (Math.random() - 0.5) * 0.4
        const vy = -0.5 - Math.random() * 0.8

        particles.push({
            x: Math.random() * canvas.width,
            y: canvas.height + size + 10,
            vx: vx,
            vy: vy,
            speed: Math.hypot(vx, vy),
            size: size,
            maxLife: life,
            life: life,
            opacity: 0.04 + Math.random() * 0.06,
            hit: false
        })
    }

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // Spawn multiple mist particles per frame to achieve high density
        for (let s = 0; s < 3; s++) {
            spawnParticle()
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i]

            // Cursor obstacle repulsion physics
            if (mouseX >= 0 && mouseY >= 0) {
                const dx = p.x - mouseX
                const dy = p.y - mouseY
                const dist = Math.hypot(dx, dy)
                const repelRadius = 110

                if (dist < repelRadius) {
                    p.hit = true // Mark particle as having interacted with the obstacle

                    const force = (repelRadius - dist) / repelRadius
                    const ux = dist > 0 ? dx / dist : (Math.random() > 0.5 ? 1 : -1)

                    // Push particle sideways away from cursor (without vertical speed changes to preserve constant rise speed)
                    p.vx += ux * force * 0.65

                    // Prevent overlap with cursor core horizontally
                    const coreRadius = 24
                    if (dist < coreRadius) {
                        const pushDist = coreRadius - dist
                        p.x += ux * pushDist
                    }
                }
            }

            // Post-hit horizontal stabilization
            if (p.hit) {
                p.vx *= 0.95 // Keep it rising vertically after the deflection
            }

            // Friction on horizontal velocity only (do not damp vertical speed to 0 so they rise continuously)
            p.vx *= 0.985

            // Calculate vy based on vx and p.speed to maintain constant overall speed
            if (p.speed) {
                const maxVx = p.speed * 0.95
                if (p.vx > maxVx) p.vx = maxVx
                if (p.vx < -maxVx) p.vx = -maxVx
                p.vy = -Math.sqrt(p.speed * p.speed - p.vx * p.vx)
            }

            p.x += p.vx
            p.y += p.vy

            p.life--

            if (p.life <= 0 || p.y < -p.size) {
                particles.splice(i, 1)
                continue
            }

            // Sine wave ease-in-out transparency
            const progress = p.life / p.maxLife
            const alpha = p.opacity * Math.sin(progress * Math.PI)

            const color = window.currentMistColor || { r: 255, g: 255, b: 255 };
            ctx.beginPath()
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
            ctx.fill()
        }

        // ── Custom white ball cursor glow ──
        if (mouseX >= 0 && mouseY >= 0) {
            const glow = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 12)
            glow.addColorStop(0, "rgba(255, 255, 255, 0.15)")
            glow.addColorStop(1, "rgba(255, 255, 255, 0)")
            ctx.beginPath()
            ctx.arc(mouseX, mouseY, 12, 0, Math.PI * 2)
            ctx.fillStyle = glow
            ctx.fill()
        }

        requestAnimationFrame(render)
    }

    render()

    // Respond to motion preference changes at runtime
    motionQuery.addEventListener("change", (e) => {
        if (e.matches) {
            particles = []
            ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
    })

})()


/* =========================================================
   WELCOME
=========================================================*/

async function welcomeUser() {
    try {
        const res = await fetch("/welcome");
        const data = await res.json();

        if (data.message) {
            addMessage(data.message, "bot");
        }
    } catch {
        addMessage("Hello! I'm Moodify. How are you feeling today?", "bot");
    }
}

function showSpotifyFallback() {
    const fallback = document.getElementById("spotifyFallback");
    if(fallback) fallback.classList.remove("hidden");
}