from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app_config import DATABASE_URL

# Handle SQLite threading compatibility
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency that yields a database session for requests."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
