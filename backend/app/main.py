"""
Urban Incident Fusion & Causal Intelligence - Backend
FastAPI application entry point.
"""
import asyncio
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .database import engine, Base, SessionLocal
from .routes import events, incidents, scenarios, sources, stream, hazards, api_v1
from .routes import weather as weather_route
from .seed import seed_mumbai_scenario
from .adapters.open_meteo import fetch_all_weather, USE_LIVE_WEATHER
from .adapters.usgs import fetch_usgs_feed_sync

logger = logging.getLogger("urban-incident-fusion")


async def _hazard_poll_loop():
    """Background task: poll Open-Meteo and USGS every 5 minutes."""
    while True:
        try:
            if USE_LIVE_WEATHER:
                logger.info("Polling Open-Meteo for weather updates...")
                fetch_all_weather()
            logger.info("Polling USGS for earthquake updates...")
            fetch_usgs_feed_sync()
            await asyncio.sleep(300)  # 5 minutes
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"Hazard poll error: {e}")
            await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables, seed data, and start background tasks on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Seed the Mumbai waterlogging demo scenario
    async with SessionLocal() as db:
        await seed_mumbai_scenario(db)
    # Start hazard polling background task
    hazard_task = asyncio.create_task(_hazard_poll_loop())
    yield
    hazard_task.cancel()
    try:
        await hazard_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Urban Incident Fusion API",
    description="Multimodal incident correlation, causal inference & confidence-aware intelligence for smart cities.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route modules
app.include_router(events.router, prefix="/api", tags=["Events"])
app.include_router(incidents.router, prefix="/api", tags=["Incidents"])
app.include_router(scenarios.router, prefix="/api", tags=["Scenarios"])
app.include_router(sources.router, prefix="/api", tags=["Sources"])
app.include_router(stream.router, prefix="/api", tags=["Stream"])
app.include_router(weather_route.router, prefix="/api", tags=["Weather"])
app.include_router(hazards.router, prefix="/api", tags=["Hazards"])
app.include_router(api_v1.router, prefix="/api", tags=["Downstream V1"])


@app.get("/api/health")
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "urban-incident-fusion",
        "use_live_weather": USE_LIVE_WEATHER,
    }
