
import os
import tempfile
import whisper
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

# Initial fastapi
app = FastAPI(title="Somleng-Aksor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        os.environ.get("FRONTEND_URL"),
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Whisper once when the server starts
model = whisper.load_model("base")

MAX_FILE_SIZE = 30 * 1024 * 1024  # 30 MB
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac"}
SUPPORTED_LANGUAGES = {"en", "km", "fr", "zh", "ja"}


@app.get("/")
async def landing():
    return {
        "status": 200,
        "message": "Welcome to Somleng-Aksor API"
    }


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str = Form("en")):
    suffix = os.path.splitext(audio.filename or "")[1].lower()

    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Audio format not supported."
        )

    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported language."
        )

    temp_path = None
    file_size = 0

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp_path = temp.name

            while chunk := await audio.read(1024 * 1024):
                file_size += len(chunk)

                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="Audio file is too large. Maximum size is 30 MB."
                    )

                temp.write(chunk)

        if file_size == 0:
            raise HTTPException(
                status_code=400,
                detail="Uploaded audio file is empty."
            )

        result = await run_in_threadpool(
            model.transcribe,
            temp_path,
            language=language,
            task="transcribe",
            fp16=False
        )

        return {
            "text": result["text"].strip(),
            "language": result["language"]
        }

    finally:
        await audio.close()

        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT"))
    )
