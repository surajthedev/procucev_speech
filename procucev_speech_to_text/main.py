import os
import io
import json
import csv
import asyncio
from typing import Optional, AsyncGenerator

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import engine, Base, get_db
import models
import schemas
import crud
from transcription_service import detect_script_and_language, process_audio_transcription
from gemini_live_stt import gemini_live_stream
from tts_service import synthesize_speech_to_bytes
import app_config

# Create relational database tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Procucev Speech-to-Text Service",
    description=(
        "Real-time multilingual Speech-to-Text (STT) API using Gemini Live. "
        "Supports Hindi, English, and mixed Hinglish with full relational DB CRUD."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static", exist_ok=True)


# ---------------------------------------------------------
# Health Check
# ---------------------------------------------------------
@app.get("/health", tags=["System"])
def health_check():
    api_key_set = bool(app_config.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", ""))
    return {
        "status": "healthy",
        "service": "Procucev Speech-to-Text API v2",
        "database": app_config.DATABASE_URL.split("://")[0],
        "gemini_api_key_configured": api_key_set,
        "stt_engine": "Gemini Live 2.5 Flash (server-side)",
    }


# ---------------------------------------------------------
# CRUD: Transcriptions
# ---------------------------------------------------------

@app.post("/api/transcriptions", response_model=schemas.TranscriptionResponse, status_code=201, tags=["Transcriptions"])
def create_transcription(payload: schemas.TranscriptionCreate, db: Session = Depends(get_db)):
    """Save a transcription record to the relational database."""
    if not payload.content or not payload.content.strip():
        raise HTTPException(status_code=400, detail="Transcription content cannot be empty.")

    if not payload.language or payload.language.lower() == "auto":
        detected = detect_script_and_language(payload.content)
        payload.language = detected
        payload.detected_language = detected
    else:
        payload.detected_language = detect_script_and_language(payload.content)

    return crud.create_transcription(db, payload)


@app.get("/api/transcriptions", response_model=schemas.TranscriptionListResponse, tags=["Transcriptions"])
def list_transcriptions(
    search: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at", pattern="^(created_at|title|word_count|confidence)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    """List transcriptions with search, filter, sort, and pagination."""
    items, total = crud.get_transcriptions(
        db, search=search, language=language, page=page,
        limit=limit, sort_by=sort_by, sort_order=sort_order,
    )
    return {"items": items, "total": total, "page": page, "limit": limit}


@app.get("/api/transcriptions/stats/summary", response_model=schemas.StatsResponse, tags=["Transcriptions"])
def stats_summary(db: Session = Depends(get_db)):
    """Statistical overview of stored transcriptions."""
    return crud.get_transcription_stats(db)


@app.get("/api/transcriptions/export/data", tags=["Transcriptions"])
def export_data(
    format_type: str = Query("json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
):
    """Export all transcriptions as JSON or CSV."""
    items, _ = crud.get_transcriptions(db, limit=10000)
    data = [item.to_dict() for item in items]

    if format_type == "csv":
        output = io.StringIO()
        fieldnames = ["id", "title", "content", "language", "detected_language",
                      "word_count", "confidence", "notes", "tags", "created_at"]
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in data:
            writer.writerow(row)
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=transcriptions.csv"},
        )
    return JSONResponse(content=data)


@app.get("/api/transcriptions/{transcription_id}", response_model=schemas.TranscriptionResponse, tags=["Transcriptions"])
def get_transcription(transcription_id: int, db: Session = Depends(get_db)):
    """Retrieve a single transcription by ID."""
    record = crud.get_transcription_by_id(db, transcription_id)
    if not record:
        raise HTTPException(status_code=404, detail="Transcription not found.")
    return record


@app.put("/api/transcriptions/{transcription_id}", response_model=schemas.TranscriptionResponse, tags=["Transcriptions"])
def update_transcription(
    transcription_id: int,
    payload: schemas.TranscriptionUpdate,
    db: Session = Depends(get_db),
):
    """Update an existing transcription record."""
    updated = crud.update_transcription(db, transcription_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Transcription not found.")
    return updated


@app.delete("/api/transcriptions/{transcription_id}", tags=["Transcriptions"])
def delete_transcription(transcription_id: int, db: Session = Depends(get_db)):
    """Delete a transcription from the database."""
    if not crud.delete_transcription(db, transcription_id):
        raise HTTPException(status_code=404, detail="Transcription not found.")
    return {"message": "Transcription deleted.", "id": transcription_id}


# ---------------------------------------------------------
# Audio Upload + Server-Side Transcription (Gemini Flash)
# ---------------------------------------------------------

@app.post("/api/transcribe/upload", tags=["Speech-to-Text"])
async def transcribe_audio_upload(
    file: UploadFile = File(...),
    language_hint: str = Form("auto"),
    auto_save: bool = Form(False),
    db: Session = Depends(get_db),
):
    """
    Upload an audio file for server-side transcription via Gemini Multimodal.
    Returns a proper HTTP 503 if GEMINI_API_KEY is not configured.
    Never saves placeholder text to the database.
    """
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

    filename = file.filename or "recording.wav"
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "wav"

    try:
        result = process_audio_transcription(audio_bytes, format_type=extension, language_hint=language_hint)
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err))

    saved_record = None
    if auto_save and result.get("content"):
        data = schemas.TranscriptionCreate(
            title=f"Uploaded: {filename}",
            content=result["content"],
            language=result.get("language", "Auto"),
            detected_language=result.get("detected_language"),
            confidence=result.get("confidence", 0.97),
            notes=f"Server-side transcription of: {filename}",
        )
        saved_record = crud.create_transcription(db, data)

    return {
        "transcription": result["content"],
        "language": result.get("language"),
        "detected_language": result.get("detected_language"),
        "confidence": result.get("confidence", 0.97),
        "saved_record": saved_record.to_dict() if saved_record else None,
    }


# ---------------------------------------------------------
# Real-Time WebSocket — Server-Side Gemini Live STT
# ---------------------------------------------------------

@app.websocket("/ws/transcribe")
async def websocket_live_transcribe(websocket: WebSocket):
    """
    WebSocket endpoint for real-time server-side STT via Gemini Live.

    Protocol:
      Client -> Server:
        {"type": "config", "language": "auto"}           -- optional, sent first
        {"type": "audio", "data": "<base64 PCM chunk>"}  -- raw 16-bit PCM, 16 kHz, mono
        {"type": "end"}                                   -- signals end of audio stream

      Server -> Client:
        {"type": "ready", "message": "..."}
        {"type": "transcript", "text": "...", "is_final": true/false}
        {"type": "error", "message": "..."}
        {"type": "pong"}
    """
    await websocket.accept()

    # Queue to pass audio bytes from receive-loop to Gemini Live generator
    audio_queue: asyncio.Queue[bytes] = asyncio.Queue()

    async def audio_producer() -> AsyncGenerator[bytes, None]:
        while True:
            chunk = await audio_queue.get()
            yield chunk
            if chunk == b"__END__":
                break

    async def receive_loop():
        """Read messages from client, push audio into queue."""
        try:
            while True:
                raw = await websocket.receive_text()
                msg = json.loads(raw)
                msg_type = msg.get("type", "")

                if msg_type == "audio":
                    audio_bytes = base64.b64decode(msg["data"])
                    await audio_queue.put(audio_bytes)

                elif msg_type == "end":
                    await audio_queue.put(b"__END__")
                    break

                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                elif msg_type == "config":
                    # Language hint acknowledged; Gemini Live handles multilingual natively
                    pass

        except WebSocketDisconnect:
            await audio_queue.put(b"__END__")

    # Run receiver and Gemini Live streaming in parallel
    receive_task = asyncio.create_task(receive_loop())

    try:
        async for event in gemini_live_stream(audio_producer()):
            await websocket.send_json(event)
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        receive_task.cancel()


# ---------------------------------------------------------
# Text-to-Speech
# ---------------------------------------------------------

@app.post("/api/tts", tags=["TTS"])
def text_to_speech(payload: schemas.TTSRequest):
    """Convert text to speech audio (MP3). Uses gTTS as open-source online TTS."""
    audio_bytes = synthesize_speech_to_bytes(payload.text, payload.language)
    if not audio_bytes:
        raise HTTPException(status_code=500, detail="TTS synthesis failed.")
    return Response(content=audio_bytes, media_type="audio/mpeg")


# ---------------------------------------------------------
# Static Files (SPA)
# ---------------------------------------------------------
app.mount("/", StaticFiles(directory="static", html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    import base64  # needed in websocket scope
    uvicorn.run("main:app", host=app_config.HOST, port=app_config.PORT, reload=app_config.DEBUG)
