import os
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv

load_dotenv()

scope = (
    "user-read-playback-state "
    "user-modify-playback-state "
    "user-read-currently-playing "
    "streaming"
)

auth_manager = SpotifyOAuth(
    client_id=os.getenv("SPOTIFY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
    redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI"),
    scope=scope,
    cache_path=".spotify_cache",
    open_browser=False
)

sp = spotipy.Spotify(auth_manager=auth_manager)


def get_valid_token():
    token_info = auth_manager.get_cached_token()

    if not token_info:
        return None

    if auth_manager.is_token_expired(token_info):
        token_info = auth_manager.refresh_access_token(
            token_info["refresh_token"]
        )

    return token_info["access_token"]


def search_track(query):

    try:
        results = sp.search(q=query, limit=5, type="track")

        return results["tracks"]["items"]

    except Exception as e:

        print("Spotify search error:", e)

        return []


def get_recommendations_by_mood(mood):

    mood = mood.lower()

    mood_map = {
        "sad": ["acoustic", "sad"],
        "calm": ["chill", "ambient"],
        "happy": ["pop", "dance"],
        "neutral": ["indie", "lofi"]
    }

    seed_genres = mood_map.get(mood, ["pop"])

    try:

        results = sp.recommendations(
            seed_genres=seed_genres[:2],
            limit=5
        )

        return results["tracks"]

    except Exception as e:

        print("Spotify recommendation error:", e)

        return []