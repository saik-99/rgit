"""Sources API routes: list devices/sources with trust and status."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Source

router = APIRouter()


@router.get("/sources")
async def list_sources(db: AsyncSession = Depends(get_db)):
    """List all registered sources/devices with trust scores and status."""
    result = await db.execute(select(Source).order_by(Source.trust_score.desc()))
    sources = result.scalars().all()
    return [s.to_dict() for s in sources]
