import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.extract import router

# Body-capturing APM is doc 02 section 4.3's fourth named trap ("nobody
# notices for six months"). There is no APM here, and this module is the
# place a reviewer looks to confirm that.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = FastAPI(title="Vanguard file extract", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://chatgpt.com", "https://claude.ai"],
    allow_methods=["POST", "GET"],
    allow_headers=["content-type", "x-vanguard-filename"],
    expose_headers=["x-vanguard-redacted-name"],
)

app.include_router(router)


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}
