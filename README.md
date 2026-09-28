---
title: Lectora Audiolibros
emoji: 📚
colorFrom: pink
colorTo: red
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Convierte PDFs y TXT a audiolibros MP3 con voces neurales en español
---

# 📚 Lectora — Creador de Audiolibros

Convierte cualquier libro en PDF o TXT a un audiolibro MP3 con voces neurales en español.

## Funciones

- Sube PDF o TXT (hasta 40 MB).
- Limpieza automática del PDF (encabezados, pies de página, números de página).
- Editor del texto antes de generar audio.
- 6 voces neurales: Perú, México y España.
- Control de velocidad de narración.
- **Historial de audiolibros** guardado en tu navegador.
- Descarga directa en MP3.

## Importante

- La generación de voz necesita conexión a Internet (usa Microsoft Edge TTS).
- Los PDF escaneados como imágenes no tienen OCR en esta versión.

## Ejecución local (desarrollo)

```bash
python app.py
```

La app abrirá automáticamente en `http://127.0.0.1:8000`.

Con recarga automática al editar:

```bash
uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```
