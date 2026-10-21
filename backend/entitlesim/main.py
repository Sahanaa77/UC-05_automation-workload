from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from entitlesim.db import init_db
from entitlesim.routers import admin, counterexamples, handlers, models, runs, simulate
from entitlesim.samples.seed import seed_sample_model
from entitlesim.schemas import HealthResponse
from entitlesim.workload.router import router as workload_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables on startup
    init_db()
    # Seed sample model on startup
    seed_sample_model()
    yield


app = FastAPI(
    title="WorkloadLens API",
    description="Automation Workload Preview SaaS (UC-05)",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health endpoints (public, exposes no tenant data)
@app.get("/api/health", response_model=HealthResponse, tags=["health"])
@app.get("/health", response_model=HealthResponse, tags=["health"])
def health_check():
    return HealthResponse(status="ok", version="0.1.0")


# Mount official UC-05 WorkloadLens routes at root
app.include_router(workload_router)

# Include prototype routers under /api for backwards compatibility
app.include_router(models.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(counterexamples.router, prefix="/api")
app.include_router(simulate.router, prefix="/api")
app.include_router(handlers.router, prefix="/api")
app.include_router(admin.router, prefix="/api")

# Serve frontend production bundle if present (supporting both local dev and container paths)
candidate_paths = [
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    Path(__file__).resolve().parent.parent / "frontend" / "dist",
    Path("/app/frontend/dist"),
]
frontend_dist = next((p for p in candidate_paths if p.is_dir()), None)
if frontend_dist:
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("entitlesim.main:app", host="0.0.0.0", port=8000, reload=True)
