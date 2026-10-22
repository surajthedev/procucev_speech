import os

# Server Configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8000))
DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1")

# Database Configuration
# Default to SQLite for zero-setup local execution; supports PostgreSQL and MySQL as well
# Examples:
# PostgreSQL: postgresql://username:password@localhost:5432/procucev_db
# MySQL: mysql+pymysql://username:password@localhost:3306/procucev_db
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./transcriptions.db")

# Speech-to-Text Configuration
# Optional: Provide Google Gemini API Key for server-side Gemini 1.5/2.0 Flash STT
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Supported Languages for Multilingual Speech-to-Text
SUPPORTED_LANGUAGES = {
    "hinglish": "Hinglish (Hindi + English)",
    "hi-IN": "Hindi (India)",
    "en-IN": "English (India)",
    "en-US": "English (US)",
    "auto": "Auto Detect (Multilingual)"
}

# Default speech recognition sample rate
AUDIO_SAMPLE_RATE = 16000
AUDIO_CHANNELS = 1
