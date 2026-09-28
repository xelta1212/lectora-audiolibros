FROM python:3.11-slim

# Evita mensajes interactivos durante la instalación
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Copia e instala dependencias primero (aprovecha la caché de Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia el resto del proyecto
COPY . .

# Hugging Face Spaces expone el puerto 7860
EXPOSE 7860

# Comando de inicio: lee PORT del entorno (Render usa $PORT, HF usa 7860)
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-7860}"]
