import os
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv

load_dotenv()

# Spotify permission scopes
scope = (
    "user-read-playback-state "
    "user-modify-playback-state "
    "user-read-currently-playing "
    "streaming"
)

# OAuth manager
auth_manager = SpotifyOAuth(
    client_id=os.getenv("SPOTIFY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
    redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
    scope=scope,
    open_browser=False
)

# Spotify client
sp = spotipy.Spotify(auth_manager=auth_manager)


# -----------------------------
# SEARCH SONG
# -----------------------------
def search_track(query):
    try:
        results = sp.search(q=query, limit=5, type="track")
        return results["tracks"]["items"]
    except Exception as e:
        print("Spotify search error:", e)
        return []


# -----------------------------
# RECOMMEND MUSIC BASED ON MOOD
# -----------------------------
def get_recommendations_by_mood(mood):

    mood = mood.lower()

    mood_map = {
        "sad": ["acoustic"],
        "calm": ["chill"],
        "happy": ["pop"],
        "neutral": ["indie"]
    }

    seed_genres = mood_map.get(mood, ["pop"])

    try:
        results = sp.recommendations(
            seed_genres=seed_genres,  # Spotify allows max 5 seeds
            limit=5
        )
        return results["tracks"]

    except Exception as e:
        print("🔥 Spotify Recommend Error:", e)

        # fallback search if recommendation fails
        try:
            results = sp.search(
                q=seed_genres[0],
                limit=5,
                type="track"
            )
            return results["tracks"]["items"]

        except Exception as e:
            print("Spotify fallback search error:", e)
            return []