import os
import json
import asyncio
import base64
from typing import Dict, Any, Optional, AsyncGenerator

from app_config import GEMINI_API_KEY


async def gemini_live_stream(audio_chunks: AsyncGenerator[bytes, None], language_hint: str = "auto") -> AsyncGenerator[Dict[str, Any], None]:
    """
    Real-time streaming transcription using Gemini Live API (google-genai).
    Yields partial and final transcript dicts as they arrive.

    This is the server-side STT engine.  The client sends raw PCM audio
    chunks over WebSocket; this coroutine feeds them to Gemini Live and
    yields transcript events back.

    NOTE: Requires GEMINI_API_KEY environment variable.
    """
    api_key = GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        yield {
            "type": "error",
            "message": "GEMINI_API_KEY is not configured on the server. Real-time STT is unavailable.",
        }
        return

    try:
        import google.genai as genai
        from google.genai import types as genai_types

        client = genai.Client(api_key=api_key, http_options={"api_version": "v1alpha"})

        # System instruction for multilingual Hinglish transcription
        system_instruction = (
            "You are a real-time speech transcription service. "
            "The speaker may use Hindi (Devanagari or Roman script), English, or a mixture of both (Hinglish). "
            "Transcribe every utterance faithfully, preserving the script and vocabulary actually used. "
            "Output only the raw transcript text with no labels, commentary, or punctuation fixes."
        )

        config = genai_types.LiveConnectConfig(
            response_modalities=["TEXT"],
            system_instruction=system_instruction,
        )

        async with client.aio.live.connect(model="gemini-live-2.5-flash-preview", config=config) as session:
            yield {"type": "ready", "message": "Gemini Live STT session established."}

            async for chunk_bytes in audio_chunks:
                if chunk_bytes == b"__END__":
                    # Signal end of audio stream
                    await session.send(input=genai_types.LiveClientRealtimeInput(audio_stream_end=True))
                    break
                # Send raw PCM audio
                await session.send(
                    input=genai_types.LiveClientRealtimeInput(
                        media_chunks=[genai_types.Blob(data=chunk_bytes, mime_type="audio/pcm")]
                    )
                )

            # Collect responses
            async for resp in session.receive():
                if resp.text:
                    yield {
                        "type": "transcript",
                        "text": resp.text,
                        "is_final": True,
                    }
                elif hasattr(resp, "server_content") and resp.server_content:
                    sc = resp.server_content
                    if hasattr(sc, "model_turn") and sc.model_turn:
                        for part in sc.model_turn.parts:
                            if part.text:
                                yield {
                                    "type": "transcript",
                                    "text": part.text,
                                    "is_final": sc.turn_complete,
                                }

    except Exception as exc:
        yield {"type": "error", "message": f"Gemini Live error: {exc}"}
