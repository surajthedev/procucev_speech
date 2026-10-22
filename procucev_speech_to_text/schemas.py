from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, model_validator


class TranscriptionBase(BaseModel):
    title: Optional[str] = Field(default="Untitled Transcription", max_length=255)
    content: str = Field(..., min_length=1)
    language: Optional[str] = Field(default="Auto", max_length=50)
    detected_language: Optional[str] = Field(default=None, max_length=50)
    duration_seconds: Optional[float] = Field(default=0.0)
    word_count: Optional[int] = Field(default=None)
    confidence: Optional[float] = Field(default=0.95)
    notes: Optional[str] = Field(default="")
    tags: Optional[str] = Field(default="")


class TranscriptionCreate(TranscriptionBase):
    pass


class TranscriptionUpdate(BaseModel):
    """All fields optional for partial update."""
    title: Optional[str] = Field(default=None, max_length=255)
    content: Optional[str] = Field(default=None, min_length=1)
    language: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None)
    tags: Optional[str] = Field(default=None)


class TranscriptionResponse(TranscriptionBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TranscriptionListResponse(BaseModel):
    items: List[TranscriptionResponse]
    total: int
    page: int
    limit: int


class StatsResponse(BaseModel):
    total_transcriptions: int
    total_words: int
    language_breakdown: dict
    average_confidence: float


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1)
    language: Optional[str] = Field(default="hi")
