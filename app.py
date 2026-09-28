from __future__ import annotations

import asyncio
import os
import re
import tempfile
import threading
import webbrowser
from pathlib import Path
from typing import Literal

import edge_tts
import fitz
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Lectora — Creador de Audiolibros")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

VOICES = {
    "es-PE-CamilaNeural",
    "es-PE-AlexNeural",
    "es-MX-DaliaNeural",
    "es-MX-JorgeNeural",
    "es-ES-ElviraNeural",
    "es-ES-AlvaroNeural",
}

def _decode_txt(data: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            pass
    return data.decode("utf-8", errors="ignore")

def _extract_pdf_text(data: bytes) -> list[str]:
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        return [page.get_text("text") for page in doc]
    finally:
        doc.close()

def _clean_pdf_pages(pages: list[str]) -> str:
    # Detecta encabezados/pies repetidos por línea entre páginas.
    page_lines = []
    frequency = {}

    for page in pages:
        page = (
            page.replace("ﬁ", "fi")
            .replace("ﬂ", "fl")
            .replace("\u00ad", "")
        )
        lines = [ln.strip() for ln in page.splitlines()]
        page_lines.append(lines)
        for ln in set(x for x in lines if x):
            if len(ln) <= 140:
                frequency[ln] = frequency.get(ln, 0) + 1

    cleaned_pages = []
    repeated_threshold = max(2, len(pages) // 2 + 1)

    for lines in page_lines:
        keep = []
        for ln in lines:
            if not ln:
                keep.append("")
                continue

            # Números de página aislados.
            if re.fullmatch(r"\d{1,4}", ln):
                continue

            # Encabezados/pies iguales que aparecen en muchas páginas.
            if len(ln) <= 140 and frequency.get(ln, 0) >= repeated_threshold:
                continue

            keep.append(ln)

        text = "\n".join(keep)

        # Une palabras partidas por maquetación de columna/salto de línea.
        text = re.sub(
            r"([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])-+\n([A-Za-zÁÉÍÓÚÜÑáéíóúüñ])",
            r"\1\2",
            text,
        )

        # Arregla ligaduras que algunos PDFs separan visualmente.
        text = re.sub(r"(?<=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])fi (?=[a-záéíóúüñ])", "fi", text)
        text = re.sub(r"(?<=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ])fl (?=[a-záéíóúüñ])", "fl", text)

        # Mantiene párrafos, pero elimina cortes de línea puramente visuales.
        paras = re.split(r"\n\s*\n", text)
        normalized = []
        for p in paras:
            p = re.sub(r"\s*\n\s*", " ", p)
            p = re.sub(r"[ \t]+", " ", p).strip()
            if p:
                normalized.append(p)

        cleaned_pages.append("\n\n".join(normalized))

    return "\n\n".join(x for x in cleaned_pages if x).strip()

def _raw_pdf_pages(pages: list[str]) -> str:
    text = "\n\n".join(pages)
    return (
        text.replace("ﬁ", "fi")
        .replace("ﬂ", "fl")
        .replace("\u00ad", "")
        .strip()
    )

@app.get("/")
async def home():
    return FileResponse(STATIC_DIR / "index.html")

@app.post("/api/extract")
async def extract_text(
    file: UploadFile = File(...),
    clean_pdf: bool = Form(True),
):
    filename = file.filename or "archivo"
    suffix = Path(filename).suffix.lower()
    if suffix not in {".pdf", ".txt"}:
        raise HTTPException(status_code=400, detail="Solo se admiten archivos PDF o TXT.")

    data = await file.read()
    if len(data) > 40 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 40 MB.")

    try:
        if suffix == ".txt":
            text = _decode_txt(data).strip()
        else:
            pages = _extract_pdf_text(data)
            text = _clean_pdf_pages(pages) if clean_pdf else _raw_pdf_pages(pages)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el archivo: {exc}")

    if not text:
        raise HTTPException(
            status_code=400,
            detail="No se encontró texto. Si el PDF es escaneado como imagen, esta versión no tiene OCR.",
        )

    return {
        "filename": filename,
        "text": text,
        "words": len(text.split()),
        "characters": len(text),
    }

@app.post("/api/generate")
async def generate_audio(
    text: str = Form(...),
    voice: str = Form("es-PE-CamilaNeural"),
    rate: int = Form(-8),
):
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="El texto está vacío.")
    if voice not in VOICES:
        raise HTTPException(status_code=400, detail="Voz no válida.")
    if rate < -30 or rate > 20:
        raise HTTPException(status_code=400, detail="La velocidad debe estar entre -30% y +20%.")

    # Evita un uso accidental descomunal en local.
    if len(text) > 500_000:
        raise HTTPException(status_code=413, detail="El texto es demasiado largo para esta versión.")

    # Crea un archivo temporal que se elimina después de ser servido.
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    tmp_path = Path(tmp.name)
    tmp.close()

    try:
        communicate = edge_tts.Communicate(
            text=text,
            voice=voice,
            rate=f"{rate:+d}%",
        )
        await communicate.save(str(tmp_path))
    except Exception as exc:
        tmp_path.unlink(missing_ok=True)
        msg = str(exc)
        if "403" in msg or "Invalid response status" in msg:
            msg = (
                "El servicio de voz rechazó la conexión (403). "
                "Comprueba tu conexión a Internet e inténtalo de nuevo."
            )
        raise HTTPException(status_code=500, detail=f"No se pudo generar el audio: {msg}")

    # FileResponse sirve el archivo y lo elimina al terminar mediante background task.
    return FileResponse(
        tmp_path,
        media_type="audio/mpeg",
        filename="audiolibro.mp3",
        background=None,
    )


# ──────────────────────────────────────────────
#  Punto de entrada
#  - LOCAL: python app.py  →  abre el navegador y escucha en 127.0.0.1:8000
#  - RENDER: arranca con el Start Command (uvicorn), este bloque no se ejecuta.
# ──────────────────────────────────────────────
def _open_browser():
    import time
    time.sleep(1.2)
    webbrowser.open("http://127.0.0.1:8000")

if __name__ == "__main__":
    # Solo abrimos el navegador en entorno local (cuando NO existe la variable PORT de Render).
    if not os.environ.get("PORT"):
        threading.Thread(target=_open_browser, daemon=True).start()

    port = int(os.environ.get("PORT", 8000))
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    uvicorn.run(app, host=host, port=port)