"""
server.py — FastAPI Translation Server
Coursera VI Subtitle Extension — Phase 2

Endpoints:
  GET  /health        → Server status + available engines
  POST /translate     → Dịch file subtitle (mảng cues)
  POST /translate/text → Dịch 1 đoạn text (preview)
  GET  /glossary      → Lấy glossary hiện tại
  POST /glossary      → Thêm/cập nhật thuật ngữ
  GET  /engines       → Danh sách engines

Run: python server.py
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import uvicorn
import asyncio

from translator import init_engines, get_engine, get_available_engines
from glossary import GlossaryManager
from subtitle_parser import parse as parse_subtitle, SubtitleCue


# === APP ===
app = FastAPI(title="Coursera VI Subtitle Server", version="1.0.0")

# CORS — cho phép extension gọi từ mọi origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# === GLOBALS ===
glossary = GlossaryManager("glossaries")


# === MODELS ===
class TranslateRequest(BaseModel):
    """Request body cho /translate"""
    texts: list[str]          # Mảng text EN cần dịch
    engine: str = "opus-mt"   # "opus-mt" hoặc "nllb-200"
    use_glossary: bool = True


class TranslateFileRequest(BaseModel):
    """Request body cho /translate — full file"""
    content: str              # Nội dung file VTT/SRT
    format: str = "vtt"       # "vtt" hoặc "srt"
    engine: str = "opus-mt"
    use_glossary: bool = True


class TranslateTextRequest(BaseModel):
    """Request body cho /translate/text"""
    text: str
    engine: str = "opus-mt"
    use_glossary: bool = True


class TranslateBatchRequest(BaseModel):
    """Request body cho /translate/batch (dùng để update progress bar)"""
    texts: list[str]
    engine: str = "opus-mt"
    use_glossary: bool = True


class TranslateJobRequest(BaseModel):
    """Request body cho Background Job"""
    cues: list[dict]
    engine: str = "opus-mt"
    use_glossary: bool = True

class CancelJobRequest(BaseModel):
    job_id: str

# Global Job Queue Storage
translation_jobs = {} # job_id -> { status, progress, result, error, cancel }

class GlossaryTermRequest(BaseModel):
    """Request body cho POST /glossary"""
    en_term: str
    vi_term: str


# === ENDPOINTS ===

@app.get("/health")
async def health():
    """Kiểm tra server + engines có sẵn"""
    engines = get_available_engines()
    return {
        "status": "ok",
        "engines": engines,
        "glossary_terms": len(glossary.terms),
    }

@app.get("/health/error")
async def log_bg_error(msg: str = ""):
    print(f"\n[BACKGROUND ERROR] {msg}\n")
    return {"status": "ok"}

@app.get("/engines")
async def list_engines():
    """Danh sách engines đã đăng ký"""
    return {"engines": get_available_engines()}


@app.post("/translate")
async def translate_file(req: TranslateFileRequest):
    """
    Dịch toàn bộ file subtitle.
    Input: nội dung file VTT/SRT + engine
    Output: mảng cue đã dịch
    """
    # 1. Lấy engine
    engine = get_engine(req.engine)
    if not engine:
        raise HTTPException(404, f"Engine '{req.engine}' not found")

    # Lazy load model
    if not engine.is_loaded:
        if not engine.load():
            raise HTTPException(500, f"Failed to load engine '{req.engine}'")

    # 2. Parse file
    cues = parse_subtitle(req.content, req.format)
    if not cues:
        raise HTTPException(400, "File không chứa phụ đề nào")

    # 3. Dich batch (chay trong thread rieng de khong block event loop)
    texts = [c.original_text for c in cues]
    translated = await asyncio.to_thread(engine.translate_batch, texts)

    # 4. Glossary post-process
    if req.use_glossary:
        translated = [
            glossary.apply_glossary(orig, trans)
            for orig, trans in zip(texts, translated)
        ]

    # 7. Build response
    result_cues = []
    for i, cue in enumerate(cues):
        result_cues.append({
            "start": cue.start,
            "end": cue.end,
            "originalText": cue.original_text,
            "translatedText": translated[i],
        })

    return {
        "success": True,
        "engine": req.engine,
        "totalCues": len(result_cues),
        "translatedCues": result_cues,
    }


@app.post("/translate/batch")
async def translate_batch_endpoint(req: TranslateBatchRequest):
    """Dịch nhiều đoạn text (phục vụ client-side chunking -> progress bar)"""
    engine = get_engine(req.engine)
    if not engine:
        raise HTTPException(404, f"Engine '{req.engine}' not found")

    if not engine.is_loaded:
        if not engine.load():
            raise HTTPException(500, f"Failed to load engine '{req.engine}'")

    # Dich (trong thread de tranh block loop)
    translated = await asyncio.to_thread(engine.translate_batch, req.texts)

    # Glossary
    if req.use_glossary:
        translated = [
            glossary.apply_glossary(orig, trans)
            for orig, trans in zip(req.texts, translated)
        ]

    return {
        "success": True,
        "engine": req.engine,
        "translatedTexts": translated,
    }


# === JOB QUEUE ARCHITECTURE ===

def process_translation_job(job_id: str, req: TranslateJobRequest):
    try:
        engine = get_engine(req.engine)
        if not engine: raise Exception(f"Engine {req.engine} not found")
        if not engine.is_loaded: engine.load()

        texts = [c.get("originalText", "") for c in req.cues]
        batch_size = 50
        translated = []
        for i in range(0, len(texts), batch_size):
            if translation_jobs[job_id].get("cancel", False):
                print(f"[Queue] Job {job_id} cancelled.")
                translation_jobs[job_id]["status"] = "cancelled"
                return

            chunk = texts[i:i+batch_size]
            results = engine.translate_batch(chunk)
            if req.use_glossary:
                results = [glossary.apply_glossary(o, t) for o, t in zip(chunk, results)]
            translated.extend(results)
            translation_jobs[job_id]["progress"] = (len(translated) / len(texts)) * 100
        
        # update cues
        for i, cue in enumerate(req.cues):
            cue["translatedText"] = translated[i]
        
        translation_jobs[job_id]["status"] = "completed"
        translation_jobs[job_id]["progress"] = 100
        translation_jobs[job_id]["result"] = req.cues
    except Exception as e:
        translation_jobs[job_id]["status"] = "error"
        translation_jobs[job_id]["error"] = str(e)


@app.post("/translate/job")
async def start_job(req: TranslateJobRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    translation_jobs[job_id] = {"status": "translating", "progress": 0, "result": None, "error": None, "cancel": False}
    background_tasks.add_task(process_translation_job, job_id, req)
    return {"success": True, "job_id": job_id}

@app.get("/translate/job/{job_id}")
async def get_job_status(job_id: str):
    if job_id not in translation_jobs:
        raise HTTPException(404, "Job not found (Server restarted or cleared)")
    return translation_jobs[job_id]

@app.post("/translate/job/cancel")
async def cancel_job(req: CancelJobRequest):
    if req.job_id in translation_jobs:
        translation_jobs[req.job_id]["cancel"] = True
    return {"success": True}

# ===============================


@app.post("/translate/text")
async def translate_text(req: TranslateTextRequest):
    """Dịch 1 đoạn text (preview nhanh)"""
    engine = get_engine(req.engine)
    if not engine:
        raise HTTPException(404, f"Engine '{req.engine}' not found")

    if not engine.is_loaded:
        if not engine.load():
            raise HTTPException(500, f"Failed to load engine '{req.engine}'")

    text = req.text
    translated = await asyncio.to_thread(engine.translate, text)

    if req.use_glossary:
        translated = glossary.apply_glossary(text, translated)

    return {
        "original": req.text,
        "translated": translated,
        "engine": req.engine,
    }


@app.get("/glossary")
async def get_glossary():
    """Lấy tất cả thuật ngữ"""
    return {
        "terms": glossary.get_all_terms(),
        "count": len(glossary.terms),
    }


@app.post("/glossary")
async def add_glossary_term(req: GlossaryTermRequest):
    """Thêm hoặc cập nhật 1 thuật ngữ"""
    glossary.add_term(req.en_term, req.vi_term)
    glossary.save_to_file("custom.json")
    return {
        "success": True,
        "term": {req.en_term: req.vi_term},
        "total_terms": len(glossary.terms),
    }


# === STARTUP ===
@app.on_event("startup")
async def startup():
    """Khoi tao engines khi server start"""
    init_engines()

    # Auto-load opus-mt
    engine = get_engine("opus-mt")
    if engine:
        engine.load()


# === RUN ===
if __name__ == "__main__":
    print("=" * 50)
    print("Coursera VI Subtitle - Translation Server")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8765)
