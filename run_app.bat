@echo off
echo ===================================================
echo     TruthLayer - Real-Time AI Output Verifier
echo ===================================================
echo.

cd /d "%~dp0"

:: Verify Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not found. Please install Python 3.10+ and add it to your PATH.
    pause
    exit /b 1
)

:: Create Virtual Environment
if not exist .venv (
    echo [INFO] Creating Python virtual environment in .venv...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

echo [INFO] Activating virtual environment...
call .venv\Scripts\activate

echo [INFO] Upgrading pip...
python -m pip install --upgrade pip

echo [INFO] Installing base dependencies (fastapi, uvicorn, requests, numpy)...
pip install fastapi uvicorn requests numpy

echo [INFO] Attempting to install sentence-transformers and spacy (NLP similarity)...
echo (This may take a moment. If compiling fails or is skipped, the app automatically runs in fast TF-IDF similarity mode.)
pip install sentence-transformers spacy

echo [INFO] Downloading spaCy English model (optional)...
python -m spacy download en_core_web_sm >nul 2>&1

echo.
echo [SUCCESS] System setup complete!
echo [INFO] Starting frontend...
start "" "index.html"

echo [INFO] Launching FastAPI backend server...
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000
