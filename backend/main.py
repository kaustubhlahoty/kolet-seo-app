from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import research, ideas, generate, articles, gsc

app = FastAPI(title="Kolet SEO API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://0.0.0.0:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(research.router, prefix="/api")
app.include_router(ideas.router,    prefix="/api")
app.include_router(generate.router, prefix="/api")
app.include_router(articles.router, prefix="/api")
app.include_router(gsc.router,      prefix="/api")

@app.get("/api/health")
def health():
    return {"status": "ok"}
