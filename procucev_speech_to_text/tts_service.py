import io
import os
from typing import Optional


def synthesize_speech_to_bytes(text: str, language_code: str = "hi") -> Optional[bytes]:
    """Synthesizes text to speech using gTTS or fallback and returns mp3 bytes."""
    if not text or not text.strip():
        return None

    lang = "hi" if language_code and language_code.lower().startswith("hi") else "en"

    try:
        from gtts import gTTS
        mp3_fp = io.BytesIO()
        tts = gTTS(text=text.strip(), lang=lang, slow=False)
        tts.write_to_fp(mp3_fp)
        mp3_fp.seek(0)
        return mp3_fp.read()
    except Exception as e:
        print(f"Error in TTS synthesis: {e}")
        return None
