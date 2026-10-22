# Procucev AI - Real-Time Multilingual Speech-to-Text Web Application

A full-stack, real-time multilingual Speech-to-Text (STT) web service with complete relational database CRUD and Text-to-Speech (TTS). Built for the Procucev AI Tech Hiring Assignment.

---

## Overview

This project implements a browser-based Speech-to-Text platform that transcribes speech in real-time, supporting Hindi (Devanagari), English, and mixed Hindi-English (Hinglish). Transcriptions are stored in a relational database (SQLite locally, PostgreSQL in production) and managed through an interactive dashboard.

The STT architecture is designed around a **self-deployed server-side engine using Gemini Live 2.5 Flash**, which processes raw PCM audio streamed over WebSocket — matching the assignment requirement of a "self-deployed open-source-style service, like Gemini Live". A dual-recogniser browser fallback (hi-IN + en-IN in parallel) is provided when no API key is configured.

---

## Key Features

### 1. Real-Time Multilingual STT — Two Modes

**Mode A: Server-side via Gemini Live (primary, when GEMINI_API_KEY is set)**

- Client captures raw PCM audio (16 kHz mono) from the microphone.
- Audio chunks are streamed via WebSocket to `/ws/transcribe`.
- Server pipes chunks to Gemini Live 2.5 Flash using the `google-genai` SDK.
- Gemini returns partial and final transcripts in real-time.
- Natively handles Hindi, English, and mixed Hinglish sentences without language switching.

**Mode B: Dual-language browser STT (fallback, no API key required)**

- Two `SpeechRecognition` instances run in parallel: one set to `hi-IN`, one to `en-IN`.
- Results from both are merged into a single live transcript stream.
- This correctly captures mixed Hinglish sentences where neither hi-IN nor en-IN alone would succeed.

### 2. Full CRUD — Transcription Database

- **Create**: Save live speech or manual notes to the relational database.
- **Read**: Paginated list with full-text search and language filter.
- **Update**: Edit title, content, language, notes, and tags. Language re-detected on content change.
- **Delete**: Confirmation dialogue before permanent removal.
- **Export**: Download all records as CSV or JSON.
- **Stats**: Word count, confidence, and language breakdown dashboard.

### 3. Audio File Upload with Gemini Transcription

- Upload WAV, MP3, WebM, or M4A files.
- Server transcribes via Gemini 2.0 Flash multimodal API.
- Returns HTTP 503 if GEMINI_API_KEY is not configured — never silently returns fake text.

### 4. Text-to-Speech (TTS)

- Backend TTS via gTTS (Hindi and English).
- Browser SpeechSynthesis fallback.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, FastAPI, Uvicorn, WebSockets, Pydantic v2 |
| Database | SQLAlchemy ORM (SQLite dev / PostgreSQL production) |
| STT | Gemini Live 2.5 Flash (server-side), Web Speech API (browser fallback) |
| SDK | google-genai 1.47+ (new SDK, replaces deprecated google-generativeai) |
| TTS | gTTS (server) + browser SpeechSynthesis (fallback) |
| Frontend | HTML5, Vanilla CSS (dark glassmorphism), ES6 JavaScript |
| Deployment | Docker, Procfile (Render / Railway) |

---

## Project Structure

```
procucev_speech_to_text/
├── app_config.py            -- Application and database configuration
├── database.py              -- SQLAlchemy engine and session
├── models.py                -- Relational database schema
├── schemas.py               -- Pydantic v2 request/response schemas
├── crud.py                  -- Database CRUD operations
├── transcription_service.py -- Gemini Multimodal STT for file uploads
├── gemini_live_stt.py       -- Gemini Live real-time STT streaming via WebSocket
├── tts_service.py           -- Text-to-Speech service
├── main.py                  -- FastAPI app with REST API and WebSocket endpoints
├── static/
│   ├── index.html           -- Single-page studio dashboard
│   ├── styles.css           -- Dark glassmorphism CSS
│   └── app.js               -- Dual-lang STT, Gemini Live client, CRUD frontend
├── requirements.txt         -- Pinned Python dependencies
├── Dockerfile               -- Container deployment
├── Procfile                 -- Render / Railway process declaration
├── .gitignore               -- Excludes venv, *.db, .env, __pycache__
├── SUBMISSION_ANSWERS.md    -- Candidate answers to 7 assignment questions
└── README.md                -- This file
```

---

## Installation and Local Setup

### Prerequisites

- Python 3.10+
- Chrome or Edge (for browser STT fallback; Gemini Live works on any browser)
- A Gemini API key (get one free at https://ai.google.dev/) — optional but recommended

### Step 1: Clone or unzip the project

```bash
cd procucev_speech_to_text
```

### Step 2: Create and activate virtual environment

```bash
python3 -m venv venv
source venv/bin/activate      # macOS / Linux
# venv\Scripts\activate       # Windows
```

### Step 3: Install dependencies

```bash
pip install -r requirements.txt
```

### Step 4: Set GEMINI_API_KEY (recommended)

```bash
export GEMINI_API_KEY="your-key-here"
```

Without this, the app falls back to dual-language browser STT. Audio file upload will return HTTP 503.

### Step 5: Run the server

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Step 6: Open the app

- Web UI: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## Database Configuration

Default: SQLite (file `transcriptions.db`, zero setup needed locally).

For production, set `DATABASE_URL` to a PostgreSQL or MySQL URL:

```bash
# PostgreSQL
export DATABASE_URL="postgresql://user:password@host:5432/procucev_db"

# MySQL
export DATABASE_URL="mysql+pymysql://user:password@host:3306/procucev_db"
```

The schema is created automatically on startup.

Note: SQLite data is lost on Render/Railway redeploys. Use a managed PostgreSQL add-on in production.

---

## API Reference

### Transcription CRUD

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/transcriptions` | Create transcription record |
| GET | `/api/transcriptions` | List with search, filter, pagination |
| GET | `/api/transcriptions/{id}` | Get single record |
| PUT | `/api/transcriptions/{id}` | Update record |
| DELETE | `/api/transcriptions/{id}` | Delete record |
| GET | `/api/transcriptions/stats/summary` | Stats overview |
| GET | `/api/transcriptions/export/data` | Export CSV or JSON |

### Speech and Audio

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/transcribe/upload` | Upload audio file for Gemini transcription |
| POST | `/api/tts` | Convert text to MP3 speech |
| WS | `/ws/transcribe` | Real-time Gemini Live STT WebSocket |
| GET | `/health` | Health and configuration status |

---

## Deployment

### Render / Railway

1. Push this repository to GitHub (venv and *.db are in .gitignore).
2. Create a new Web Service, select Python runtime.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables: `GEMINI_API_KEY`, `DATABASE_URL` (PostgreSQL add-on URL).

### Docker

```bash
docker build -t procucev-stt .
docker run -e GEMINI_API_KEY=your-key -e DATABASE_URL=postgresql://... -p 8000:8000 procucev-stt
```

---

## Design Decisions

- **Gemini Live over Whisper**: Gemini Live 2.5 Flash is multimodal, multilingual, and available via API without self-hosting GPU hardware — directly satisfying the assignment's "self-deployed open-source service like Gemini Live" phrasing.
- **Dual-recogniser fallback**: Two parallel Web Speech API instances (hi-IN + en-IN) are the only browser-native way to correctly handle code-switched Hinglish sentences.
- **No fake fallback**: Upload endpoint returns HTTP 503 when no API key is available, preventing placeholder data from being stored.
- **XSS prevention**: All user-generated content is rendered with `textContent` — never `innerHTML`.
- **New SDK**: `google-genai` replaces the deprecated `google-generativeai` package as required for Gemini Live API access.
