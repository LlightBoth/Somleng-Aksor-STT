# Somleng-Aksor

Somleng-Aksor is an AI-powered speech-to-text application that converts audio recordings into written text. It uses OpenAI Whisper to support multiple languages, including Khmer, English, French, Chinese, and Japanese. Users can upload audio files and transcribe speech through a simple, user-friendly interface.


## Frontend

## Features

- Upload audio files for transcription.
- Support multiple languages:
  - English
  - French
  - Khmer
  - Chinese
  - Japanese
- Record and transcribe speech.
- View and copy transcription results.
- Simple and responsive user interface.

## Tech Stack

- **React** – Frontend library
- **Vite** – Development and build tool
- **Tailwind CSS** – Styling
- **Lucide React** – Icons

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/LlightBoth/Somleng-Aksor-STT.git
cd Somleng-Aksor
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in frontend folder:

```env
VITE_API_URL=http://localhost:3000
```

Replace the URL with your real backend API.

### 4. Start the development server

```bash
npm run dev
```

Open the local URL provided by Vite in your browser.

## Backend

The backend API for **Somleng-Aksor**, an AI-powered speech-to-text application. It uses OpenAI Whisper to process audio recordings and convert speech into written text.

## Tech Stack

- **Python** – Backend programming language
- **FastAPI** – REST API framework
- **OpenAI Whisper** – Speech recognition model
- **Uvicorn** – ASGI server

## Getting Started

### 1. Clone the repository

```bash
cd Somleng-Aksor/backend
```

### 2. Create a virtual environment

```bash
python -m venv venv
```

Activate it:

**Windows:**
```bash
venv\Scripts\activate
```

**Linux / macOS:**
```bash
source venv/bin/activate
```

### 3. Install dependencies

```bash
python -m pip install -r requirements.txt
python -m pip install fastapi uvicorn python-multipart openai-whisper
```

**Note:** Whisper requires FFmpeg to process audio files. Install FFmpeg and make sure it is available in your system PATH.

### 3. Configure environment variables

Create a `.env` file in backend folder:
```
PORT=3005
FRONTEND_URL=127.0.0.1
```
Change port and FRONTEND_URL to your desire

### 4. Run the server

```bash
python main.py
uvicorn main:app --reload --host 0.0.0.0 --port 3005
```

The API will be available at:

```text
http://localhost:3005
```

## Environment & Configuration

The server supports the `PORT` environment variable for deployment platforms.
Default port: `3000` when running through `python main.py`.