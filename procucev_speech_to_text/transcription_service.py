import os
import re
from typing import Dict, Any
from app_config import GEMINI_API_KEY


# ----------------------------------------------------------------
# Language / Script Detection
# ----------------------------------------------------------------

def detect_script_and_language(text: str) -> str:
    """Detect whether text is Hindi, English, or Hinglish (mixed)."""
    if not text or not text.strip():
        return "Unknown"

    has_devanagari = bool(re.search(r'[\u0900-\u097F]', text))
    has_latin = bool(re.search(r'[a-zA-Z]', text))

    if has_devanagari and has_latin:
        return "Hinglish (Mixed)"
    if has_devanagari:
        return "Hindi"
    if has_latin:
        # Phonetic Hinglish words written in Roman script
        hinglish_keywords = {
            "hai", "ho", "kya", "kar", "rahe", "kaise", "bhai", "theek", "acha",
            "karenge", "bhi", "yeh", "woh", "mera", "tera", "apna", "shukriya",
            "nahi", "karo", "bolo", "sun", "dekho", "aaj", "kal", "samajh",
            "bilkul", "haan", "achha", "thik", "matlab", "lagta", "chahiye",
        }
        tokens = set(re.findall(r'\b[a-zA-Z]+\b', text.lower()))
        if tokens & hinglish_keywords:
            return "Hinglish (Roman)"
    return "English"


# ----------------------------------------------------------------
# Gemini Audio Transcription (server-side STT via google-genai)
# ----------------------------------------------------------------

def transcribe_audio_with_gemini(audio_bytes: bytes, mime_type: str = "audio/wav") -> Dict[str, Any]:
    """
    Transcribes audio bytes using Google Gemini 2.0 Flash (multimodal)
    via the new google-genai SDK.  Returns a structured dict.
    Raises RuntimeError if GEMINI_API_KEY is missing so callers can
    surface a proper 503 error instead of silently returning fake text.
    """
    api_key = GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. "
            "Set the environment variable to enable server-side transcription."
        )

    try:
        # New SDK: pip install google-genai
        import google.genai as genai
        from google.genai import types as genai_types

        client = genai.Client(api_key=api_key)

        prompt = (
            "You are a multilingual transcription engine. "
            "Transcribe the following audio exactly as spoken. "
            "The speaker may switch between Hindi (Devanagari or Roman) and English within a single sentence (Hinglish). "
            "Preserve all spoken words and the original script used. "
            "Output only the verbatim transcription with no extra commentary, labels, or quotation marks."
        )

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                prompt,
                genai_types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
            ],
        )

        transcribed_text = (response.text or "").strip()
        if not transcribed_text:
            raise RuntimeError("Gemini returned an empty transcription.")

        detected_lang = detect_script_and_language(transcribed_text)
        return {
            "success": True,
            "content": transcribed_text,
            "language": detected_lang,
            "detected_language": detected_lang,
            "confidence": 0.97,
        }

    except RuntimeError:
        raise  # re-raise config / empty-response errors
    except Exception as exc:
        raise RuntimeError(f"Gemini transcription failed: {exc}") from exc


# ----------------------------------------------------------------
# Public helper called from main.py /api/transcribe/upload
# ----------------------------------------------------------------

def process_audio_transcription(
    audio_data: bytes,
    format_type: str = "wav",
    language_hint: str = "hinglish",
) -> Dict[str, Any]:
    """
    Entry-point for audio transcription via Gemini.
    Raises RuntimeError on any failure so the API layer can return a
    meaningful HTTP error instead of saving fake placeholder text.
    """
    mime_map = {
        "wav":  "audio/wav",
        "mp3":  "audio/mpeg",
        "webm": "audio/webm",
        "ogg":  "audio/ogg",
        "m4a":  "audio/mp4",
    }
    mime_type = mime_map.get(format_type.lower(), "audio/wav")
    return transcribe_audio_with_gemini(audio_data, mime_type)
