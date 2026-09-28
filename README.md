# Lectora — Creador de Audiolibros

Web local para convertir archivos PDF o TXT a MP3 con voces naturales.

## Cómo iniciar en Windows

1. Descomprime todo el ZIP.
2. Haz doble clic en `INICIAR_WEB.bat`.
3. La primera vez instalará las dependencias automáticamente.
4. Se abrirá tu navegador en `http://127.0.0.1:8000`.

## Funciones

- Arrastrar o seleccionar PDF/TXT.
- Limpieza básica de PDF:
  - números de página aislados;
  - encabezados/pies repetidos;
  - palabras partidas por saltos de línea.
- Editor del texto antes de generar audio.
- Voces de Perú, México y España.
- Control de velocidad.
- Reproductor de audio.
- Descarga directa en MP3.

## Importante

- Necesita Python 3.11 o superior.
- La generación de voz mediante edge-tts necesita conexión a Internet.
- La web corre solo en tu PC (`127.0.0.1`) y no se publica en Internet.
- Los PDF escaneados como imágenes no tienen OCR en esta versión.


## Corrección v2

Esta versión usa `edge-tts 7.2.8`, compatible con los cambios recientes del servicio
de voz de Microsoft. El iniciador actualiza automáticamente las dependencias al abrirse.
