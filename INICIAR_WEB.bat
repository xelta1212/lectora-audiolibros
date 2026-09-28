@echo off
setlocal
cd /d "%~dp0"
title Lectora - Creador de Audiolibros

where py >nul 2>nul
if %errorlevel%==0 (
  set "PY=py"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set "PY=python"
  ) else (
    echo.
    echo Python no esta instalado o no esta agregado al PATH.
    echo Instala Python 3.11 o superior y vuelve a abrir este archivo.
    echo.
    pause
    exit /b 1
  )
)

if not exist ".venv" (
  echo Preparando la aplicacion por primera vez...
  %PY% -m venv .venv
)

call ".venv\Scripts\activate.bat"

python -m pip install --upgrade pip >nul
pip install --upgrade -r requirements.txt

if errorlevel 1 (
  echo.
  echo No se pudieron instalar las dependencias.
  echo Revisa tu conexion a Internet.
  pause
  exit /b 1
)

python app.py

endlocal
