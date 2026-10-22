from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Float, DateTime
from database import Base


def _now():
    """UTC-aware now() as Python-side default; avoids deprecated datetime.utcnow."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Transcription(Base):
    __tablename__ = "transcriptions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(255), nullable=False, default="Untitled Transcription")
    content = Column(Text, nullable=False)
    language = Column(String(50), nullable=False, default="Hinglish")
    detected_language = Column(String(50), nullable=True)
    duration_seconds = Column(Float, nullable=True, default=0.0)
    word_count = Column(Integer, nullable=False, default=0)
    confidence = Column(Float, nullable=True, default=0.95)
    notes = Column(Text, nullable=True, default="")
    tags = Column(String(255), nullable=True, default="")
    created_at = Column(DateTime, default=_now, nullable=False)
    updated_at = Column(DateTime, default=_now, onupdate=_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "language": self.language,
            "detected_language": self.detected_language,
            "duration_seconds": self.duration_seconds,
            "word_count": self.word_count,
            "confidence": self.confidence,
            "notes": self.notes,
            "tags": self.tags,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
