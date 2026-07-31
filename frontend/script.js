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
    
    const musicTherapyText = document.getElementById("musicTherapyText");
    
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

        // Apply Spotify green glowing gradient
        if (musicTherapyText) {
            musicTherapyText.classList.remove("from-white", "via-white/80", "to-white/40");
            musicTherapyText.classList.add("spotify-glow-text");
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

        // Restore default silver-white gradient
        if (musicTherapyText) {
            musicTherapyText.classList.remove("spotify-glow-text");
            musicTherapyText.classList.add("from-white", "via-white/80", "to-white/40");
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

    // Contact Us and About Sliding Panel Listeners
    const contactUsBtn = document.getElementById("contactUsBtn");
    const navAboutBtn = document.getElementById("navAboutBtn");
    const aboutPanel = document.getElementById("aboutPanel");
    const closeAboutBtn = document.getElementById("closeAboutBtn");

    if (contactUsBtn) {
        contactUsBtn.addEventListener("click", (e) => {
            e.preventDefault();
            navigator.clipboard.writeText("sarveshkyadav18@gmail.com").then(() => {
                const originalText = contactUsBtn.textContent;
                contactUsBtn.innerHTML = `Email Copied! <span class="material-symbols-outlined text-[14px]">done</span>`;
                showToast("Admin email copied to clipboard!");
                setTimeout(() => {
                    contactUsBtn.textContent = "Contact Us";
                }, 2000);
            }).catch(err => {
                console.error("Failed to copy email:", err);
                showToast("sarveshkyadav18@gmail.com");
            });
        });
    }

    if (navAboutBtn && aboutPanel) {
        navAboutBtn.addEventListener("click", (e) => {
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
            const isAboutTrigger = (navAboutBtn && (navAboutBtn.contains(e.target) || e.target === navAboutBtn));
            if (!aboutPanel.contains(e.target) && !isAboutTrigger) {
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

    // Clear Logs button click listener
    const clearLogsBtn = document.getElementById("clearLogsBtn");
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener("click", clearMoodLogs);
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

let targetRegion = null;
let currentTargetRegion = null;
let overlayOpacity = 0;
let overlayAnimFrame = null;
let scanLineY = 0;
let scanDirection = 1;

function drawSciFiOverlay() {
    const canvas = document.getElementById("overlayCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    
    const video = document.getElementById("videoFeed");
    if (!video || video.paused || video.ended) {
        overlayAnimFrame = requestAnimationFrame(drawSciFiOverlay);
        return;
    }
    
    // Ensure canvas dimensions match the displayed video box size
    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (targetRegion) {
        // Fade in
        overlayOpacity = Math.min(1, overlayOpacity + 0.15);
        
        // Interpolate current position towards target
        if (!currentTargetRegion) {
            currentTargetRegion = { ...targetRegion };
        } else {
            currentTargetRegion.x += (targetRegion.x - currentTargetRegion.x) * 0.15;
            currentTargetRegion.y += (targetRegion.y - currentTargetRegion.y) * 0.15;
            currentTargetRegion.w += (targetRegion.w - currentTargetRegion.w) * 0.15;
            currentTargetRegion.h += (targetRegion.h - currentTargetRegion.h) * 0.15;
        }
    } else {
        // Fade out
        overlayOpacity = Math.max(0, overlayOpacity - 0.15);
        if (overlayOpacity === 0) {
            currentTargetRegion = null;
        }
    }
    
    if (currentTargetRegion && overlayOpacity > 0) {
        // Translate coordinates from original video dimension to canvas dimension
        const scaleX = canvas.width / (video.videoWidth || 640);
        const scaleY = canvas.height / (video.videoHeight || 480);
        
        const x = currentTargetRegion.x * scaleX;
        const y = currentTargetRegion.y * scaleY;
        const w = currentTargetRegion.w * scaleX;
        const h = currentTargetRegion.h * scaleY;
        
        ctx.save();
        ctx.globalAlpha = overlayOpacity;
        
        // Define color based on detected emotion
        const emotionText = (document.getElementById("camEmotion")?.textContent || "").trim().toLowerCase();
        let hudColor = "rgba(0, 255, 65, 0.85)"; // Green by default (Matrix Style)
        if (emotionText === "sad" || emotionText === "fear") {
            hudColor = "rgba(0, 191, 255, 0.85)"; // Deep sky blue
        } else if (emotionText === "angry") {
            hudColor = "rgba(239, 68, 68, 0.85)"; // Red
        } else if (emotionText === "happy") {
            hudColor = "rgba(234, 179, 8, 0.85)"; // Yellow/Gold
        } else if (emotionText === "surprise") {
            hudColor = "rgba(168, 85, 247, 0.85)"; // Purple
        }
        
        ctx.strokeStyle = hudColor;
        ctx.fillStyle = hudColor;
        ctx.lineWidth = 2;
        
        // 1. Draw Corner brackets
        const bracketLength = Math.min(20, w * 0.2);
        
        // Top-left
        ctx.beginPath();
        ctx.moveTo(x, y + bracketLength);
        ctx.lineTo(x, y);
        ctx.lineTo(x + bracketLength, y);
        ctx.stroke();
        
        // Top-right
        ctx.beginPath();
        ctx.moveTo(x + w - bracketLength, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + bracketLength);
        ctx.stroke();
        
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(x, y + h - bracketLength);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + bracketLength, y + h);
        ctx.stroke();
        
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(x + w - bracketLength, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w, y + h - bracketLength);
        ctx.stroke();
        
        // 2. Draw outer bounding box (very faint dotted line)
        ctx.strokeStyle = hudColor.replace("0.85", "0.15");
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        
        // 3. Draw moving scanning line inside box
        scanLineY += 1.5 * scanDirection;
        if (scanLineY > h) {
            scanLineY = h;
            scanDirection = -1;
        } else if (scanLineY < 0) {
            scanLineY = 0;
            scanDirection = 1;
        }
        
        ctx.beginPath();
        ctx.strokeStyle = hudColor.replace("0.85", "0.4");
        ctx.moveTo(x + 2, y + scanLineY);
        ctx.lineTo(x + w - 2, y + scanLineY);
        ctx.stroke();
        
        // Draw glow under scanline
        const grad = ctx.createLinearGradient(x, y + scanLineY - 6 * scanDirection, x, y + scanLineY);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, hudColor.replace("0.85", "0.15"));
        ctx.fillStyle = grad;
        if (scanDirection === 1) {
            ctx.fillRect(x + 2, y + scanLineY - 12, w - 4, 12);
        } else {
            ctx.fillRect(x + 2, y + scanLineY, w - 4, 12);
        }
        
        // 4. Draw Sci-Fi scanner text above box
        ctx.font = "bold 9px monospace";
        ctx.fillStyle = hudColor;
        const textLabel = `[ LOCKING TARGET: ${(emotionText && emotionText !== "--" ? emotionText : "DETECTING").toUpperCase()} ]`;
        ctx.fillText(textLabel, x, y - 8);
        
        // 5. Draw crosshair in the center
        const cx = x + w / 2;
        const cy = y + h / 2;
        ctx.strokeStyle = hudColor.replace("0.85", "0.4");
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy);
        ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5);
        ctx.stroke();
        
        ctx.restore();
    }
    
    overlayAnimFrame = requestAnimationFrame(drawSciFiOverlay);
}

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

            // Start HUD Overlay loop
            if (overlayAnimFrame) cancelAnimationFrame(overlayAnimFrame);
            overlayAnimFrame = requestAnimationFrame(drawSciFiOverlay);

            // Poll emotion state by sending frame every 2 seconds
            const frameCtx = videoCanvas.getContext("2d");
            cameraStateInterval = setInterval(async () => {
                frameCtx.drawImage(videoFeed, 0, 0, videoCanvas.width, videoCanvas.height);
                const b64_img = videoCanvas.toDataURL("image/jpeg", 0.6);

                try {
                    const res = await fetch("/analyze-frame/", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ image: b64_img })
                    });
                    
                    const data = await res.json();
                    
                    // Update target region for HUD overlay
                    targetRegion = data.region || null;

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
    
    // Stop HUD Overlay loop and clear canvas
    if (overlayAnimFrame) {
        cancelAnimationFrame(overlayAnimFrame);
        overlayAnimFrame = null;
    }
    const canvas = document.getElementById("overlayCanvas");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    targetRegion = null;
    currentTargetRegion = null;
    overlayOpacity = 0;
    
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

    // Release the AudioContext so repeated sessions don't leak contexts
    // (browsers cap the number of live AudioContexts per page).
    if (audioContext) {
        try { audioContext.close(); } catch (e) { /* already closed */ }
        audioContext = null;
        analyser = null;
        microphone = null;
    }

    resetVoiceUI();
}

let originalSpotifyVolume = 0.6;

function duckSpotifyVolume() {
    if (spotifyPlayer) {
        try {
            const volumeSlider = document.getElementById("volumeSlider");
            const currentVol = volumeSlider ? parseFloat(volumeSlider.value) / 100 : 0.6;
            originalSpotifyVolume = currentVol;
            spotifyPlayer.setVolume(0.15).catch(err => console.error("Spotify duck volume error:", err));
        } catch (err) {
            console.error("Ducking error:", err);
        }
    }
}

function restoreSpotifyVolume() {
    if (spotifyPlayer) {
        try {
            spotifyPlayer.setVolume(originalSpotifyVolume).catch(err => console.error("Spotify restore volume error:", err));
        } catch (err) {
            console.error("Restore volume error:", err);
        }
    }
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
           
           // Duck Spotify volume before assistant speaks
           duckSpotifyVolume();
           
           // Show captions of what the bot is speaking
           voiceStatus.innerText = data.reply;
           
           if (data.audio_b64) {
               const audio = new Audio("data:audio/mp3;base64," + data.audio_b64);
               audio.onended = () => { 
                   restoreSpotifyVolume();
                   isProcessingAudio = false; 
                   voiceStatus.innerText = "Speak when ready..."; 
               };
               audio.play().catch(e => { 
                   console.error("Audio playback failed:", e); 
                   restoreSpotifyVolume();
                   isProcessingAudio = false; 
                   voiceStatus.innerText = "Speak when ready..."; 
               });
           } else {
               const utterance = new SpeechSynthesisUtterance(data.reply);
               utterance.onend = () => { 
                   restoreSpotifyVolume();
                   isProcessingAudio = false; 
                   voiceStatus.innerText = "Speak when ready..."; 
               };
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


/* =========================================================
   SIDEBAR TAB SWITCHING
=========================================================*/

document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        const targetView = tab.dataset.tab;
        if (!targetView) return;

        // Update active nav state
        document.querySelectorAll(".nav-tab").forEach(t => {
            t.classList.remove("active", "bg-primary/10", "text-primary", "font-semibold");
            t.classList.add("text-on-surface-variant", "font-medium");
        });
        tab.classList.add("active", "bg-primary/10", "text-primary", "font-semibold");
        tab.classList.remove("text-on-surface-variant", "font-medium");

        // Show/hide view panels
        document.querySelectorAll(".view-panel").forEach(panel => {
            panel.classList.add("hidden");
        });
        const activePanel = document.querySelector(`[data-view="${targetView}"]`);
        if (activePanel) {
            activePanel.classList.remove("hidden");
        }

        // Close mobile sidebar after switching
        const sidebar = document.getElementById("sidebarNav");
        if (sidebar && window.innerWidth < 768) {
            sidebar.classList.add("-translate-x-full");
        }

        // Load data for the active view
        if (targetView === "logs") loadMoodLogs();
        if (targetView === "analytics") loadAnalytics();
        if (targetView === "library") renderLibrary();
        if (targetView === "community") loadCommunityPosts();
    });
});


/* =========================================================
   MOOD LOG VIEW
=========================================================*/

async function loadMoodLogs() {
    const container = document.getElementById("logsContent");
    if (!container) return;

    try {
        const res = await fetch("/api/logs");
        const data = await res.json();
        const logs = data.logs || [];

        if (logs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 text-on-surface-variant/60">
                    <span class="material-symbols-outlined text-[48px] mb-3 block opacity-30">sentiment_neutral</span>
                    <p class="text-sm">Start chatting to build your mood history.</p>
                </div>`;
            return;
        }

        let html = `<div class="mood-log-header"><span>Date</span><span>Message</span><span>Score</span><span>Emotion</span></div>`;
        html += `<div class="flex flex-col gap-2">`;

        logs.forEach(log => {
            const date = log.timestamp ? new Date(log.timestamp + "Z").toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "--";
            const score = log.wellbeing_score;
            const scoreClass = score == null ? "" : score < 45 ? "low" : score > 75 ? "high" : "mid";
            const scoreDisplay = score != null ? `<span class="score-badge ${scoreClass}">${score}</span>` : `<span class="text-on-surface-variant/40">--</span>`;
            const emotion = log.detected_emotion || "--";
            const text = (log.text || "").length > 80 ? log.text.substring(0, 80) + "…" : (log.text || "--");

            html += `<div class="mood-log-row">
                <span class="text-on-surface-variant/70">${date}</span>
                <span class="text-on-surface/90 truncate">${text}</span>
                ${scoreDisplay}
                <span class="text-on-surface-variant/80 capitalize">${emotion}</span>
            </div>`;
        });

        html += `</div>`;
        container.innerHTML = html;
    } catch (e) {
        console.error("Failed to load mood logs:", e);
    }
}

async function clearMoodLogs() {
    if (!confirm("Are you sure you want to clear your entire chat history and mood logs? This action is permanent and cannot be undone.")) {
        return;
    }

    try {
        const res = await fetch("/api/logs", {
            method: "DELETE"
        });
        const data = await res.json();
        if (data.status === "success") {
            showToast("Mood logs and chat history cleared.");
            
            // Clear chat display list in UI if present
            const chatMessagesContainer = document.getElementById("chatMessages");
            if (chatMessagesContainer) {
                chatMessagesContainer.innerHTML = "";
            }
            
            // Reload logs view to show empty state
            loadMoodLogs();
        } else {
            showToast("Failed to clear logs.");
        }
    } catch (e) {
        console.error("Failed to clear logs:", e);
        showToast("Error clearing logs.");
    }
}


/* =========================================================
   ANALYTICS VIEW — Chart.js
=========================================================*/

let wellbeingChart = null;

async function loadAnalytics(days = 30) {
    try {
        const res = await fetch(`/api/analytics?days=${days}`);
        const data = await res.json();
        const analytics = data.analytics || [];

        const labels = analytics.map(d => {
            const dt = new Date(d.day);
            return dt.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
        });
        const scores = analytics.map(d => d.avg_score);
        const msgCounts = analytics.map(d => d.msg_count);

        // Update stats
        const avgEl = document.getElementById("statAvgScore");
        const msgsEl = document.getElementById("statTotalMsgs");
        const trendEl = document.getElementById("statTrend");

        if (scores.length > 0) {
            const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            const totalMsgs = msgCounts.reduce((a, b) => a + b, 0);
            if (avgEl) avgEl.textContent = avg;
            if (msgsEl) msgsEl.textContent = totalMsgs;

            if (scores.length >= 2) {
                const diff = scores[scores.length - 1] - scores[0];
                if (trendEl) {
                    trendEl.textContent = (diff >= 0 ? "↑" : "↓") + Math.abs(Math.round(diff));
                    trendEl.className = `text-xl font-bold ${diff >= 0 ? "text-green-400" : "text-red-400"}`;
                }
            }
        } else {
            if (avgEl) avgEl.textContent = "—";
            if (msgsEl) msgsEl.textContent = "—";
            if (trendEl) trendEl.textContent = "—";
        }

        // Toggle empty state overlay when there is no wellbeing data yet
        const hasData = scores.length > 0;
        const emptyEl = document.getElementById("analyticsEmpty");
        if (emptyEl) emptyEl.classList.toggle("hidden", hasData);

        // Render Chart
        const canvas = document.getElementById("wellbeingChart");
        if (!canvas) return;
        // Hide the empty axis/gridlines so the empty-state message reads clean
        canvas.style.opacity = hasData ? "1" : "0";
        const ctx = canvas.getContext("2d");

        if (wellbeingChart) {
            wellbeingChart.destroy();
        }

        wellbeingChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [{
                    label: "Wellbeing Score",
                    data: scores,
                    borderColor: "rgba(255, 255, 255, 0.8)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: "#ffffff",
                    pointBorderColor: "rgba(255,255,255,0.3)",
                    pointRadius: 4,
                    pointHoverRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "rgba(20,20,20,0.9)",
                        titleColor: "#fff",
                        bodyColor: "#ccc",
                        borderColor: "rgba(255,255,255,0.1)",
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                    }
                },
                scales: {
                    x: {
                        grid: { color: "rgba(255,255,255,0.04)" },
                        ticks: { color: "rgba(190,190,190,0.75)", font: { size: 10 } },
                    },
                    y: {
                        min: 0,
                        max: 100,
                        grid: { color: "rgba(255,255,255,0.04)" },
                        ticks: { color: "rgba(190,190,190,0.75)", font: { size: 10 }, stepSize: 25 },
                    }
                },
                interaction: { intersect: false, mode: "index" },
            }
        });

    } catch (e) {
        console.error("Failed to load analytics:", e);
    }
}

// Analytics range buttons
document.querySelectorAll(".analytics-range-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".analytics-range-btn").forEach(b => {
            b.classList.remove("active", "border-primary/40", "text-primary", "bg-primary/10");
            b.classList.add("border-white/10", "text-on-surface-variant");
        });
        btn.classList.add("active", "border-primary/40", "text-primary", "bg-primary/10");
        btn.classList.remove("border-white/10", "text-on-surface-variant");
        loadAnalytics(parseInt(btn.dataset.days) || 30);
    });
});


/* =========================================================
   LIBRARY VIEW
=========================================================*/

const LIBRARY_CATEGORIES = [
    { name: "Focus Acoustic", icon: "psychology", query: "focus acoustic instrumental", desc: "Enhance concentration with gentle acoustic flows" },
    { name: "Deep Calm", icon: "self_improvement", query: "deep calm ambient instrumental", desc: "Lower stress with peaceful ambient soundscapes" },
    { name: "Restful Ambient", icon: "bedtime", query: "sleep ambient instrumental relaxing", desc: "Drift into restful sleep with soft textures" },
    { name: "Nature Sounds", icon: "park", query: "nature sounds rain forest instrumental", desc: "Ground yourself with natural acoustic environments" },
    { name: "Lo-Fi Study", icon: "headphones", query: "lofi study beats instrumental", desc: "Background beats for productive study sessions" },
    { name: "Meditation", icon: "spa", query: "meditation music tibetan bowls", desc: "Guided meditative journeys with sacred sounds" },
    { name: "Piano Therapy", icon: "piano", query: "peaceful piano solo classical", desc: "Soothing solo piano for emotional healing" },
    { name: "Uplifting Energy", icon: "bolt", query: "uplifting happy instrumental acoustic", desc: "Bright acoustic energy to lift your mood" },
];

function renderLibrary() {
    const grid = document.getElementById("libraryGrid");
    if (!grid) return;

    grid.innerHTML = LIBRARY_CATEGORIES.map(cat => `
        <div class="library-card" onclick="playLibraryCategory('${cat.query}', '${cat.name}')">
            <div class="card-icon">
                <span class="material-symbols-outlined text-white/70 text-[20px]">${cat.icon}</span>
            </div>
            <h3 class="font-display text-sm font-bold text-white mb-1">${cat.name}</h3>
            <p class="text-[11px] text-on-surface-variant/70 leading-relaxed">${cat.desc}</p>
        </div>
    `).join("");
}

async function playLibraryCategory(query, categoryName) {
    if (!spotifyToken || !deviceId) {
        showToast("Connect Spotify first to play library tracks.");
        return;
    }

    try {
        const res = await fetch(`/spotify-search?query=${encodeURIComponent(query)}`);
        const tracks = await res.json();
        if (tracks && tracks.length > 0) {
            isAutoPlayingWellbeing = false;
            trackQueue = tracks;
            currentTrackIndex = 0;
            playTrack(trackQueue[0]);
            showToast(`Playing: ${categoryName}`);

            // Switch to chat view to see player
            document.querySelector('[data-tab="chat"]').click();
        } else {
            showToast("No tracks found for this category.");
        }
    } catch (e) {
        console.error("Library play error:", e);
        showToast("Failed to search tracks.");
    }
}

// Initialize library on first render
renderLibrary();


/* =========================================================
   COMMUNITY VIEW
=========================================================*/

async function loadCommunityPosts() {
    const container = document.getElementById("communityPosts");
    if (!container) return;

    // Show a loading placeholder immediately so the panel is never blank
    // while the request is in flight.
    if (!container.dataset.loaded) {
        container.innerHTML = `
            <div class="text-center py-16 text-on-surface-variant/60">
                <span class="material-symbols-outlined text-[48px] mb-3 block opacity-30 animate-pulse">forum</span>
                <p class="text-sm">Loading reflections…</p>
            </div>`;
    }

    try {
        const res = await fetch("/api/community/posts");
        const data = await res.json();
        const posts = data.posts || [];
        container.dataset.loaded = "1";

        if (posts.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 text-on-surface-variant/60">
                    <span class="material-symbols-outlined text-[48px] mb-3 block opacity-30">forum</span>
                    <p class="text-sm">Be the first to share a reflection.</p>
                </div>`;
            return;
        }

        container.innerHTML = posts.map(post => {
            const time = post.timestamp ? new Date(post.timestamp + "Z").toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
            const moodEmoji = { happy: "😊", calm: "😌", sad: "😢", anxious: "😰", grateful: "🙏", hopeful: "🌟" };
            const tagHtml = post.mood_tag ? `<span class="community-mood-tag">${moodEmoji[post.mood_tag] || ""} ${post.mood_tag}</span>` : "";

            return `<div class="community-card">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-semibold text-white/90">${post.alias || "Anonymous"}</span>
                    <span class="text-[10px] text-on-surface-variant/50">${time}</span>
                </div>
                <p class="text-sm text-on-surface-variant/90 leading-relaxed">${post.content}</p>
                ${tagHtml ? `<div class="mt-3">${tagHtml}</div>` : ""}
            </div>`;
        }).join("");

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    } catch (e) {
        console.error("Failed to load community posts:", e);
        // Never leave the panel blank — show a recoverable error state
        if (!container.dataset.loaded) {
            container.innerHTML = `
                <div class="text-center py-16 text-on-surface-variant/60">
                    <span class="material-symbols-outlined text-[48px] mb-3 block opacity-30">cloud_off</span>
                    <p class="text-sm">Couldn't load reflections. Please try again.</p>
                </div>`;
        }
    }
}

// Community post submission
const communityPostBtn = document.getElementById("communityPostBtn");
const communityInput = document.getElementById("communityInput");
const communityMoodTag = document.getElementById("communityMoodTag");

if (communityPostBtn && communityInput) {
    communityPostBtn.addEventListener("click", submitCommunityPost);
    communityInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            submitCommunityPost();
        }
    });
}

async function submitCommunityPost() {
    const content = communityInput.value.trim();
    if (!content) return;

    const moodTag = communityMoodTag ? communityMoodTag.value : "";

    try {
        const res = await fetch("/api/community/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, mood_tag: moodTag || null })
        });
        const data = await res.json();
        if (data.status === "success") {
            communityInput.value = "";
            if (communityMoodTag) communityMoodTag.value = "";
            showToast(`Posted anonymously as "${data.alias}"`);
            loadCommunityPosts();
        }
    } catch (e) {
        console.error("Community post failed:", e);
        showToast("Failed to post reflection.");
    }
}


/* =========================================================
   BREATHING SESSION
=========================================================*/

const startSessionBtn = document.getElementById("startSessionBtn");
const breathingOverlay = document.getElementById("breathingOverlay");
const closeBreathingBtn = document.getElementById("closeBreathingBtn");
const startBreathingBtn = document.getElementById("startBreathingBtn");
const breathingOrb = document.getElementById("breathingOrb");
const breathingPhase = document.getElementById("breathingPhase");
const breathingTimer = document.getElementById("breathingTimer");

let breathingInterval = null;
let breathingActive = false;

if (startSessionBtn) {
    startSessionBtn.addEventListener("click", () => {
        if (breathingOverlay) breathingOverlay.classList.remove("hidden");
        resetBreathing();
    });
}

if (closeBreathingBtn) {
    closeBreathingBtn.addEventListener("click", () => {
        stopBreathing();
        if (breathingOverlay) breathingOverlay.classList.add("hidden");
    });
}

if (startBreathingBtn) {
    startBreathingBtn.addEventListener("click", () => {
        if (breathingActive) return;
        startBreathingBtn.classList.add("hidden");
        runBreathingSession();
    });
}

function resetBreathing() {
    breathingActive = false;
    if (breathingInterval) clearTimeout(breathingInterval);
    if (breathingOrb) breathingOrb.className = "breathing-orb";
    if (breathingPhase) breathingPhase.textContent = "Get Ready";
    if (breathingTimer) breathingTimer.textContent = "Press start to begin";
    if (startBreathingBtn) startBreathingBtn.classList.remove("hidden");
}

function stopBreathing() {
    breathingActive = false;
    if (breathingInterval) clearTimeout(breathingInterval);
    resetBreathing();
}

async function runBreathingSession() {
    breathingActive = true;
    const totalCycles = 3;
    const phaseDuration = 4000; // 4 seconds per phase
    let currentCycle = 0;

    // Record wellbeing before
    const scoreBefore = parseInt(document.getElementById("wellbeingScore")?.textContent) || null;
    const startTime = Date.now();

    function runCycle() {
        if (!breathingActive || currentCycle >= totalCycles) {
            // Session complete
            breathingActive = false;
            if (breathingOrb) breathingOrb.className = "breathing-orb";
            if (breathingPhase) breathingPhase.textContent = "Session Complete ✓";
            if (breathingTimer) breathingTimer.textContent = "Great job! Take a moment.";

            // Log session
            const duration = Math.round((Date.now() - startTime) / 1000);
            const scoreAfter = parseInt(document.getElementById("wellbeingScore")?.textContent) || null;
            fetch("/api/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_type: "Breathing",
                    duration_seconds: duration,
                    wellbeing_before: scoreBefore,
                    wellbeing_after: scoreAfter,
                })
            }).catch(e => console.error("Session log failed:", e));

            showToast("Breathing session completed. Session logged.");

            setTimeout(() => {
                if (breathingOverlay) breathingOverlay.classList.add("hidden");
                resetBreathing();
            }, 3000);
            return;
        }

        currentCycle++;

        // Phase 1: Inhale
        if (breathingOrb) breathingOrb.className = "breathing-orb inhale";
        if (breathingPhase) breathingPhase.textContent = "Breathe In";
        if (breathingTimer) breathingTimer.textContent = `Cycle ${currentCycle}/${totalCycles}`;

        breathingInterval = setTimeout(() => {
            // Phase 2: Hold
            if (!breathingActive) return;
            if (breathingOrb) breathingOrb.className = "breathing-orb hold";
            if (breathingPhase) breathingPhase.textContent = "Hold";

            breathingInterval = setTimeout(() => {
                // Phase 3: Exhale
                if (!breathingActive) return;
                if (breathingOrb) breathingOrb.className = "breathing-orb exhale";
                if (breathingPhase) breathingPhase.textContent = "Breathe Out";

                breathingInterval = setTimeout(() => {
                    if (!breathingActive) return;
                    runCycle();
                }, phaseDuration);

            }, phaseDuration);

        }, phaseDuration);
    }

    runCycle();
}