from typing import Optional, List, Tuple, Dict
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc, func
from models import Transcription
from schemas import TranscriptionCreate, TranscriptionUpdate
from transcription_service import detect_script_and_language


def count_words(text: str) -> int:
    return len(text.strip().split()) if text and text.strip() else 0


def create_transcription(db: Session, data: TranscriptionCreate) -> Transcription:
    word_count = data.word_count if data.word_count is not None else count_words(data.content)
    db_obj = Transcription(
        title=data.title or "Untitled Transcription",
        content=data.content.strip(),
        language=data.language or "Auto",
        detected_language=data.detected_language or detect_script_and_language(data.content),
        duration_seconds=data.duration_seconds or 0.0,
        word_count=word_count,
        confidence=data.confidence if data.confidence is not None else 0.95,
        notes=data.notes or "",
        tags=data.tags or "",
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_transcriptions(
    db: Session,
    search: Optional[str] = None,
    language: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> Tuple[List[Transcription], int]:
    query = db.query(Transcription)

    if search:
        pat = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Transcription.title.ilike(pat),
                Transcription.content.ilike(pat),
                Transcription.notes.ilike(pat),
                Transcription.tags.ilike(pat),
            )
        )

    if language and language.lower() != "all":
        query = query.filter(Transcription.language.ilike(f"%{language.strip()}%"))

    total = query.count()
    sort_col = getattr(Transcription, sort_by, Transcription.created_at)
    query = query.order_by(asc(sort_col) if sort_order.lower() == "asc" else desc(sort_col))
    items = query.offset((page - 1) * limit).limit(limit).all()
    return items, total


def get_transcription_by_id(db: Session, tid: int) -> Optional[Transcription]:
    return db.query(Transcription).filter(Transcription.id == tid).first()


def update_transcription(db: Session, tid: int, data: TranscriptionUpdate) -> Optional[Transcription]:
    obj = get_transcription_by_id(db, tid)
    if not obj:
        return None

    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(obj, field, value)

    # Re-detect language whenever content changes
    if "content" in updates and updates["content"]:
        obj.word_count = count_words(obj.content)
        obj.detected_language = detect_script_and_language(obj.content)

    db.commit()
    db.refresh(obj)
    return obj


def delete_transcription(db: Session, tid: int) -> bool:
    obj = get_transcription_by_id(db, tid)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


def get_transcription_stats(db: Session) -> Dict:
    total = db.query(Transcription).count()
    total_words = db.query(func.sum(Transcription.word_count)).scalar() or 0
    avg_conf = db.query(func.avg(Transcription.confidence)).scalar() or 0.0

    lang_rows = db.query(Transcription.language, func.count(Transcription.id)) \
                  .group_by(Transcription.language).all()
    language_breakdown = {lang or "Unknown": cnt for lang, cnt in lang_rows}

    return {
        "total_transcriptions": total,
        "total_words": int(total_words),
        "language_breakdown": language_breakdown,
        "average_confidence": round(float(avg_conf), 2),
    }
