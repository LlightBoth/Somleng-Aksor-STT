import { useState, useRef, useEffect, useMemo } from "react";
import { AudioLines, Mic, MicOff, Upload, Play, Pause, Copy, Check, Search, Sparkles, Clock, FileText, X, ChevronDown, AlertCircle, CheckCircle2, Edit3, ExclamationMark } from "lucide-react";
import {API_URL} from "../server/api";

const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024; 

const LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "km", name: "Khmer", nativeName: "ភាសាខ្មែរ", flag: "🇰🇭" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" }
];

const DEMO_TRANSCRIPTS = {
  km: "សួស្តីបងប្អូនទាំងអស់គ្នា! នេះគឺជាគម្រោង Somleng-Aksor (សំឡេងអក្សរ) ដែលប្រើប្រាស់បច្ចេកវិទ្យាបញ្ញាសិប្បនិម្មិត Whisper AI ដើម្បីបម្លែងសំឡេងនិយាយទៅជាអក្សរយ៉ាងត្រឹមត្រូវ និងរហ័ស។ ប្រព័ន្ធនេះអាចជួយសម្រួលដល់ការកត់ត្រាក្នុងកិច្ចប្រជុំ ការធ្វើបទសម្ភាសន៍ និងការរៀបចំឯកសារផ្សេងៗ។",
  en: "Welcome to Somleng-Aksor Studio. This professional speech-to-text platform converts high-fidelity audio streams and dictations into structured transcripts using state-of-the-art neural speech recognition models. It supports multilingual translation, automated punctuation, and fast subtitle generation.",
  fr: "Bienvenue dans Somleng-Aksor. Cette plateforme professionnelle de reconnaissance vocale transforme vos enregistrements audio en transcriptions précises avec ponctuation automatique et options d'export multiples.",
};

export default function App() {
  // Input mode: 'upload' or 'record'
  const [inputMode, setInputMode] = useState("upload");

  // Audio file & metadata
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // Language settings
  const [language, setLanguage] = useState("km");
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  // Processing & result
  const [loading, setLoading] = useState(false);
  const [processingTime, setProcessingTime] = useState(0);
  const [transcribeStep, setTranscribeStep] = useState(0);
  const [result, setResult] = useState("");
  const [detectedLang, setDetectedLang] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Editor & view settings
  const [isEditing, setIsEditing] = useState(false);
  const [fontSize, setFontSize] = useState("base"); // 'sm' | 'base' | 'lg'
  const [searchQuery, setSearchQuery] = useState("");

  // UI Modals
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState("checking"); // 'online' | 'offline' | 'checking'

  // Refs
  const fileInputRef = useRef(null);
  const audioRef = useRef(null);
  const searchInputRef = useRef(null);

  // Ping backend to check health
  const checkServer = async () => {
    setServerStatus("checking");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${API_URL}/health`, {
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error("Server unavailable");
      }

      const data = await res.json();

      setServerStatus(data.status === "online" ? "online" : "offline");
    } catch {
      setServerStatus("offline");
    } finally {
      clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    checkServer();
  }, []);

  // Update audio URL when file changes
  useEffect(() => {
    if (!file) {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setAudioDuration(0);
      setAudioCurrentTime(0);
      setIsPlaying(false);
      return;
    }

    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    const tempAudio = new Audio(url);
    tempAudio.onloadedmetadata = () => {
      if (tempAudio.duration && !isNaN(tempAudio.duration)) {
        setAudioDuration(tempAudio.duration);
      }
    };

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Audio element sync
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Enter or Cmd+Enter to Transcribe
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (file && !loading) {
          transcribeAudio();
        }
      }
      // Esc closes open popovers
      if (e.key === "Escape") {
        setLangDropdownOpen(false);
        setShortcutsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [file, loading, language]);

  // File selection validation (including 200MB limit)
  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    // Check size limit: 200MB
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      const errorMsg = "File too big. Maximum allowed size is 30MB.";
      setError(errorMsg);
      showToast(errorMsg, "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const allowedTypes = [
      "audio/mp3",
      "audio/wav",
      "audio/ogg",
      "audio/webm",
      "audio/x-m4a",
      "audio/flac",
    ];

    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    const allowedExts = ["mp3", "wav", "ogg", "webm", "m4a", "flac"];

    if (!allowedTypes.includes(selectedFile.type) && !allowedExts.includes(ext || "")) {
      showToast("Please upload a supported audio file (MP3, WAV, M4A, OGG, WEBM, FLAC).", "error");
      return;
    }

    setFile(selectedFile);
    setError("");
  };

  // Microphone recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          mimeType = "audio/ogg";
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        const recordedFile = new File(
          [audioBlob],
          `voice-dictation-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`,
          { type: mimeType }
        );
        handleFileSelect(recordedFile);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      showToast("Microphone access was denied or not available.", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      audioChunksRef.current = [];
    }
  };

  // Audio Player Controls
  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setAudioCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleAudioSeek = (e) => {
    const time = parseFloat(e.target.value);
    setAudioCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setAudioCurrentTime(0);
  };

  // Notification helper
  const showToast = (msg, type = "info") => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(""), 4000);
  };

  // Transcription process
  const transcribeAudio = async () => {
    if (!file) {
      setError("Please upload an audio file or record speech first.");
      return;
    }

    setLoading(true);
    setError("");
    setTranscribeStep(1);
    setProcessingTime(0);

    const timer = setInterval(() => {
      setProcessingTime((t) => t + 1);
    }, 1000);

    // Simulated progress steps for great UX
    const step2Timer = setTimeout(() => setTranscribeStep(2), 1200);
    const step3Timer = setTimeout(() => setTranscribeStep(3), 3500);

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("language", language);

      const response = await fetch(`${API_URL}/transcribe`, {
          method: "POST",
          body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        throw new Error(
            errorData.detail || `Server responded with status ${response.status}`
        );
      }

      const data = await response.json();
      const transcribedText = data.text?.trim() || "";
      const langUsed = data.language || language;

      setResult(transcribedText);
      setDetectedLang(langUsed);
      showToast("Audio transcribed successfully!", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong during transcription.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      clearInterval(timer);
      clearTimeout(step2Timer);
      clearTimeout(step3Timer);
      setLoading(false);
      setTranscribeStep(0);
    }
  };


  // Copy result to clipboard
  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      showToast("Transcript copied to clipboard!", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Failed to copy transcript to clipboard.", "error");
    }
  };

  // Format helpers
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const selectedLangObj = useMemo(
    () => LANGUAGES.find((l) => l.code === language) || LANGUAGES[0],
    [language]
  );

  const wordCount = useMemo(() => {
    if (!result) return 0;
    return result.trim().split(/\s+/).filter(Boolean).length;
  }, [result]);

  const readingTimeMinutes = useMemo(() => {
    if (wordCount === 0) return 0;
    return Math.max(1, Math.ceil(wordCount / 180));
  }, [wordCount]);

  // Search match highlights
  const highlightedContent = useMemo(() => {
    if (!searchQuery.trim() || !result) return null;
    const query = searchQuery.trim();
    const regex = new RegExp(`(${query.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")})`, "gi");
    const parts = result.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-amber-300 text-stone-900 font-semibold px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  }, [result, searchQuery]);

  return (
    <div className="min-h-screen bg-[#faf8f5] text-stone-800 flex flex-col font-sans selection:bg-amber-500 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md text-sm transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${toastMessage.type === "error"
            ? "bg-rose-50 border-rose-200 text-rose-800"
            : toastMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-white border-stone-200 text-stone-800"
            }`}
        >
          {toastMessage.type === "error" && <AlertCircle size={16} className="text-rose-600" />}
          {toastMessage.type === "success" && <CheckCircle2 size={16} className="text-emerald-600" />}
          {toastMessage.type === "info" && <Sparkles size={16} className="text-amber-600" />}
          <span className="font-medium">{toastMessage.text}</span>
        </div>
      )}

      {/* Hidden audio element for preview */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleAudioTimeUpdate}
          onEnded={handleAudioEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {/* Top Header Navigation */}
      <header className="sticky top-0 z-30 border-b border-[#e7e4dc] bg-white/90 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3.5">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3.5 select-none group">
            {/* Brand Icon: White base with Amber-100 accent & subtle depth */}
            <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-white border border-amber-200/80 shadow-sm shadow-amber-900/5 transition-all duration-200 group-hover:border-amber-300 group-hover:shadow-md group-hover:shadow-amber-500/10">
              {/* Soft amber-100 inner glow */}
              <div className="w-8 h-8 rounded-xl bg-amber-200/80 flex items-center justify-center text-amber-800">
                {/* Audio Waveform SVG */}
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3v18" />
                  <path d="M8 8v8" />
                  <path d="M16 8v8" />
                  <path d="M4 11v2" />
                  <path d="M20 11v2" />
                </svg>
              </div>
            </div>

            {/* Brand Text & Khmer Pill */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-stone-900">
                  Somleng-Aksor
                </h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200/70">
                  សំឡេងអក្សរ
                </span>
              </div>

              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-xs font-medium text-stone-500 tracking-wide">
                  Whisper AI Speech-to-Text Studio
                </p>
              </div>
            </div>
          </div>

          {/* Right Toolbar */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Server Status Pill */}
            <button
              onClick={checkServer}
              title="Backend connectivity status"
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${serverStatus === "online"
                ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100/60"
                : serverStatus === "checking"
                  ? "bg-stone-100 text-stone-600 border-stone-200"
                  : "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100/60"
                }`}
            >
              <span>
                {serverStatus === "online"
                  ? "Online Mode"
                  : serverStatus === "checking"
                    ? "Connecting..."
                    : "Offline Mode"}
              </span>
            </button>

            {/* Keyboard Shortcuts button */}
            <button
              onClick={() => setShortcutsOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-800 hover:bg-white transition-colors"
              title="Keyboard shortcuts (?)"
            >
              ?
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Offline Banner alert if backend is unreachable */}
        {serverStatus === "offline" && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-100/80 p-4 sm:p-5 backdrop-blur-md shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-100 p-2 text-amber-700 border border-amber-200 mt-0.5">
                  <ExclamationMark size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-amber-900">
                    The Server is not connected
                  </h4>
                  <p className="text-xs text-amber-800/80 mt-1">
                    Please try again later!
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={checkServer}
                  className="rounded-lg bg-white hover:bg-stone-50 border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 transition"
                >
                  Retry Connection
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ================= LEFT COLUMN: AUDIO INPUT & CONFIG ================= */}
          <section className="lg:col-span-5 space-y-5">
            {/* Step 1: Audio Source Card */}
            <div className="rounded-2xl border border-[#e6e2da] bg-white p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.03)] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200/60">
                    01
                  </span>
                  <h2 className="text-sm font-bold tracking-tight text-stone-800 uppercase">
                    Audio Source
                  </h2>
                </div>

                {/* Segmented Mode Tabs */}
                <div className="flex rounded-xl bg-[#f4f1ea] p-1 border border-[#e5e1d7]">
                  <button
                    onClick={() => {
                      setInputMode("upload");
                      cancelRecording();
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${inputMode === "upload"
                      ? "bg-white text-stone-900 shadow-sm font-semibold"
                      : "text-stone-500 hover:text-stone-800"
                      }`}
                  >
                    <Upload size={13} />
                    File Upload
                  </button>
                  <button
                    onClick={() => setInputMode("record")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${inputMode === "record"
                      ? "bg-white text-stone-900 shadow-sm font-semibold"
                      : "text-stone-500 hover:text-stone-800"
                      }`}
                  >
                    <Mic size={13} />
                    Live Dictation
                  </button>
                </div>
              </div>

              {/* Mode 1: File Upload Dropzone */}
              {inputMode === "upload" && (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,.wav,.ogg,.webm,.m4a,.flac,.aac,audio/*"
                    hidden
                    onChange={(e) => handleFileSelect(e.target.files?.[0])}
                  />

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      handleFileSelect(e.dataTransfer.files?.[0]);
                    }}
                    className={`relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200 ${isDragOver
                      ? "border-amber-500 bg-amber-100/50 scale-[0.99]"
                      : "border-[#d8d3c7] bg-[#fdfcfa] hover:border-amber-400 hover:bg-amber-100/20"
                      }`}
                  >
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 border border-amber-200/70 transition-transform">
                      <Upload size={22} />
                    </div>

                    <p className="text-sm font-semibold text-stone-800">
                      Drop audio file here or{" "}
                      <span className="text-amber-600 underline underline-offset-4 decoration-amber-400">
                        browse
                      </span>
                    </p>

                    <p className="mt-1 text-xs text-stone-500 font-medium">
                      Supports MP3, WAV, M4A, OGG, WEBM, FLAC (Max 100MB)
                    </p>

                    <div className="mt-3 flex items-center gap-1.5 flex-wrap justify-center">
                      {["MP3", "WAV", "M4A", "OGG", "WEBM"].map((tag) => (
                        <span
                          key={tag}
                          className="rounded px-2 py-0.5 text-[10px] font-mono font-medium text-stone-600 bg-[#f0ede6] border border-[#e3ded4]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Mode 2: In-Browser Microphone Recording */}
              {inputMode === "record" && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-[#e6e2da] bg-[#fdfcfa] p-6 text-center space-y-4">
                  {isRecording ? (
                    <>
                      {/* Active Recording State */}
                      <div className="relative flex items-center justify-center">
                        <span className="absolute h-20 w-20 rounded-full bg-rose-500/20 animate-ping" />
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-md shadow-rose-500/30">
                          <Mic size={28} />
                        </div>
                      </div>

                      {/* Soundwave animation */}
                      <div className="flex items-center gap-1.5 h-7">
                        <span className="w-1.5 bg-rose-500 rounded-full animate-soundwave-1" />
                        <span className="w-1.5 bg-rose-500 rounded-full animate-soundwave-2" />
                        <span className="w-1.5 bg-rose-500 rounded-full animate-soundwave-3" />
                        <span className="w-1.5 bg-rose-500 rounded-full animate-soundwave-4" />
                        <span className="w-1.5 bg-rose-500 rounded-full animate-soundwave-5" />
                        <span className="w-1.5 bg-rose-500 rounded-full animate-soundwave-2" />
                        <span className="w-1.5 bg-rose-500 rounded-full animate-soundwave-4" />
                      </div>

                      <div className="font-mono text-xl font-bold text-rose-600 tracking-wider">
                        {formatTime(recordingSeconds)}
                      </div>

                      <p className="text-xs text-stone-500 font-medium">
                        Listening to microphone... Speak clearly.
                      </p>

                      <div className="flex items-center gap-2.5 pt-1">
                        <button
                          onClick={stopRecording}
                          className="flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition"
                        >
                          <MicOff size={14} />
                          Stop & Transcribe
                        </button>
                        <button
                          onClick={cancelRecording}
                          className="rounded-xl border border-stone-200 bg-white hover:bg-stone-50 px-3.5 py-2 text-xs font-medium text-stone-600 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Idle Record Prompt */}
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 border border-amber-200/70">
                        <Mic size={24} />
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-stone-800">
                          Direct Voice Dictation
                        </h3>
                        <p className="text-xs text-stone-500 mt-1 max-w-xs">
                          Record speeches, meeting notes, or interviews directly from your browser.
                        </p>
                      </div>

                      <button
                        onClick={startRecording}
                        className="flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition"
                      >
                        <Mic size={14} />
                        Start Recording
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Loaded Audio Player Card */}
              {file && (
                <div className="rounded-xl border border-[#e5e1d7] bg-[#f7f5f0] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 border border-amber-200/80">
                        <AudioLines size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-stone-800">
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-stone-500 font-mono">
                          <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                          <span>•</span>
                          <span>{formatTime(audioDuration)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="rounded-lg p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition"
                      title="Remove audio"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Audio Controls */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={togglePlayAudio}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white hover:bg-amber-600 shadow-xs transition"
                        title={isPlaying ? "Pause preview" : "Play preview"}
                      >
                        {isPlaying ? <Pause size={13} className="fill-current" /> : <Play size={13} className="fill-current ml-0.5" />}
                      </button>

                      {/* Scrubber */}
                      <input
                        type="range"
                        min="0"
                        max={audioDuration || 100}
                        step="0.1"
                        value={audioCurrentTime}
                        onChange={handleAudioSeek}
                        className="w-full h-1.5 bg-[#ded9cd] rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />

                      {/* Speed selector */}
                      <button
                        onClick={() => {
                          const speeds = [1, 1.25, 1.5, 2];
                          const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                          setPlaybackSpeed(next);
                        }}
                        className="shrink-0 px-2 py-0.5 rounded text-[10px] font-mono font-semibold text-stone-600 bg-white border border-[#ded9cd] hover:border-stone-400"
                        title="Playback speed"
                      >
                        {playbackSpeed}x
                      </button>
                    </div>

                    <div className="flex justify-between text-[10px] font-mono text-stone-500 px-0.5">
                      <span>{formatTime(audioCurrentTime)}</span>
                      <span>{formatTime(audioDuration)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Language & Engine Card */}
            <div className="rounded-2xl border border-[#e6e2da] bg-white p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.03)] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200/60">
                    02
                  </span>
                  <h3 className="text-sm font-bold tracking-tight text-stone-800 uppercase">
                    Language Engine
                  </h3>
                </div>

                <span className="text-[11px] font-mono text-stone-500 bg-[#f7f5f0] px-2 py-0.5 rounded border border-[#e5e1d7]">
                  Model OpenAI Whisper
                </span>
              </div>

              {/* Quick Language Chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { code: "en", label: "English 🇺🇸" },
                  { code: "fr", label: "French 🇫🇷" },
                  { code: "km", label: "Khmer 🇰🇭" },
                  { code: "zh", label: "Chinese 🇨🇳" },
                  { code: "ja", label: "Japanese 🇯🇵" },
                ].map((item) => (
                  <button
                    key={item.code}
                    onClick={() => setLanguage(item.code)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${language === item.code
                      ? "bg-amber-50 border-amber-300 text-amber-900 font-semibold shadow-xs"
                      : "bg-[#f7f5f0] border-[#e5e1d7] text-stone-600 hover:border-stone-300 hover:text-stone-900"
                      }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Clean Language Selector Dropdown */}
              <div className="relative">
                <label className="block text-xs font-medium text-stone-600 mb-1.5">
                  Select Transcription Language
                </label>

                <button
                  type="button"
                  onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                  className="flex w-full items-center justify-between rounded-xl border border-[#ded9cd] bg-[#fdfcfa] px-3.5 py-2.5 text-left text-sm hover:border-stone-400 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{selectedLangObj.flag}</span>
                    <span className="font-semibold text-stone-800">
                      {selectedLangObj.name}
                    </span>
                    <span className="text-xs text-stone-500 font-sans">
                      ({selectedLangObj.nativeName})
                    </span>
                  </div>
                  <ChevronDown size={16} className="text-stone-400" />
                </button>

                {langDropdownOpen && (
                  <div className="absolute z-40 mt-1.5 w-full rounded-xl border border-[#ded9cd] bg-white p-2 shadow-xl backdrop-blur-md">
                    <div className="max-h-56 overflow-y-auto space-y-0.5">
                      {LANGUAGES.map((item) => (
                        <button
                          key={item.code}
                          onClick={() => {
                            setLanguage(item.code);
                            setLangDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition ${language === item.code
                            ? "bg-amber-50 text-amber-900 font-bold"
                            : "text-stone-700 hover:bg-[#faf8f5]"
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{item.flag}</span>
                            <span>{item.name}</span>
                            <span className="text-[11px] text-stone-500">
                              ({item.nativeName})
                            </span>
                          </div>
                          {language === item.code && (
                            <Check size={14} className="text-amber-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sample audio link */}
              <div className="pt-1 flex items-center justify-between text-xs">
                <span className="text-stone-500">Ready yet</span>
                <button
                  type="button"
                  className="text-amber-600 hover:text-amber-700 font-semibold underline underline-offset-4 decoration-amber-400"
                >
                  Try load audio now
                </button>
              </div>
            </div>

            {/* Error Message banner */}
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
                <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">Notice</p>
                  <p className="text-rose-700 mt-0.5">{error} audio, try again later.</p>
                </div>
              </div>
            )}

            {/* Primary Action Button */}
            <button
              onClick={transcribeAudio}
              disabled={!file || loading}
              className="relative w-full rounded-xl bg-amber-500 text-amber-800 border-amber-200 hover:bg-amber-500/60 shadow-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50 transition group"
            >
              <div className="flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 font-bold text-white transition">
                {loading ? (
                  <>
                    <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span className="text-sm">
                      {transcribeStep === 1
                        ? "Uploading Audio..."
                        : transcribeStep === 2
                          ? "Whisper Neural Processing..."
                          : "Formatting Transcript..."}
                      {" "}({processingTime}s)
                    </span>
                  </>
                ) : (
                  <>
                    <AudioLines size={18} className="stroke-[2.5]" />
                    <span className="text-sm tracking-wide">
                      Transcribe Audio
                    </span>
                  </>
                )}
              </div>
            </button>
          </section>

          {/* ================= RIGHT COLUMN: TRANSCRIPT WORKSPACE ================= */}
          <section className="lg:col-span-7 flex flex-col space-y-4">
            <div className="rounded-2xl border border-[#e6e2da] bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.03)] flex flex-col min-h-[580px]">
              {/* Studio Header Toolbar */}
              <div className="border-b border-[#e7e4dc] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700 border border-amber-200/80">
                    <FileText size={15} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-stone-800">
                      Transcript Workspace
                    </h3>
                  </div>
                </div>

                {/* Metrics / Stats Badges */}
                <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
                  <span className="rounded-md bg-[#f7f5f0] px-2 py-1 text-stone-600 border border-[#e5e1d7]">
                    {wordCount} words
                  </span>
                  <span className="rounded-md bg-[#f7f5f0] px-2 py-1 text-stone-600 border border-[#e5e1d7]">
                    {result ? result.length : 0} chars
                  </span>
                  {wordCount > 0 && (
                    <span className="rounded-md bg-[#f7f5f0] px-2 py-1 text-stone-600 border border-[#e5e1d7] hidden sm:inline-block">
                      ~{readingTimeMinutes} min read
                    </span>
                  )}
                  {detectedLang && (
                    <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800 border border-amber-200 font-semibold">
                      {detectedLang.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {/* Secondary Controls Bar (Search, Edit Mode, Font Size, Actions) */}
              <div className="border-b border-[#eceae4] bg-[#faf8f5]/60 px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                {/* Search within transcript */}
                <div className="relative flex-1 min-w-[140px] max-w-xs">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-2 text-stone-400"
                  />
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search in transcript..."
                    className="w-full rounded-lg border border-[#ded9cd] bg-white py-1 pl-7 pr-7 text-xs text-stone-800 placeholder-stone-400 outline-none focus:border-amber-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1.5 text-stone-400 hover:text-stone-700"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-2">
                  {/* Font Size Selector */}
                  <div className="flex items-center rounded-lg bg-[#f0ede6] border border-[#ded9cd] p-0.5">
                    <button
                      onClick={() => setFontSize("sm")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${fontSize === "sm"
                        ? "bg-white text-stone-900 font-bold shadow-xs"
                        : "text-stone-500 hover:text-stone-800"
                        }`}
                      title="Compact font"
                    >
                      A-
                    </button>
                    <button
                      onClick={() => setFontSize("base")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${fontSize === "base"
                        ? "bg-white text-stone-900 font-bold shadow-xs"
                        : "text-stone-500 hover:text-stone-800"
                        }`}
                      title="Default font"
                    >
                      A
                    </button>
                    <button
                      onClick={() => setFontSize("lg")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${fontSize === "lg"
                        ? "bg-white text-stone-900 font-bold shadow-xs"
                        : "text-stone-500 hover:text-stone-800"
                        }`}
                      title="Large font"
                    >
                      A+
                    </button>
                  </div>

                  {/* Edit Mode Toggle */}
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition ${isEditing
                      ? "bg-amber-100 border-amber-300 text-amber-900 font-semibold"
                      : "bg-white border-[#ded9cd] text-stone-600 hover:text-stone-900"
                      }`}
                    title="Toggle edit mode"
                  >
                    <Edit3 size={13} />
                    <span>{isEditing ? "Editing" : "Edit"}</span>
                  </button>

                  {/* Copy Button */}
                  <button
                    onClick={handleCopy}
                    disabled={!result}
                    className="flex items-center gap-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 px-3 py-1 text-xs font-semibold text-white transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Copy transcript (Ctrl+C)"
                  >
                    {copied ? (
                      <>
                        <Check size={13} className="text-emerald-300" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>


                </div>
              </div>

              {/* Main Transcript Canvas Body */}
              <div className="relative flex-1 p-5 sm:p-6 overflow-y-auto">
                {/* Transcribing Overlay Indicator */}
                {loading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xs p-6 text-center space-y-4">
                    <div className="relative flex h-14 w-14 items-center justify-center">
                      <div className="h-10 w-10 rounded-full border-3 border-amber-500 border-t-transparent animate-spin" />
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-stone-800">
                        Neural Acoustic Model at Work
                      </h4>
                      <p className="text-xs text-stone-500 mt-1 max-w-sm">
                        Whisper is transcribing audio tokens and aligning speech phonemes with Khmer and multilingual vocabularies.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                      <Clock size={12} />
                      <span>Elapsed: {processingTime}s</span>
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {!result && !loading && (
                  <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-6 space-y-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#faf8f5] text-stone-400 border border-[#e6e2da]">
                      <FileText size={28} className="text-amber-500" />
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-stone-800">
                        Transcription Ready
                      </h4>
                      <p className="text-xs text-stone-500 mt-1 max-w-md">
                        Upload an audio recording or start voice dictation on the left to generate formatted text transcripts.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg pt-4 text-left">
                      {/* 1 - Whisper AI */}
                      <div className="rounded-xl border border-[#e6e2da] bg-[#faf8f5] p-3">
                        <span className="text-amber-600 font-bold text-xs">01</span>
                        <h5 className="text-xs font-bold text-stone-800 mt-1">
                          OpenAI Whisper
                        </h5>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Powered by OpenAI's Whisper speech recognition model.
                        </p>
                      </div>

                      {/* 2 - Multi languages */}
                      <div className="rounded-xl border border-[#e6e2da] bg-[#faf8f5] p-3">
                        <span className="text-amber-600 font-bold text-xs">02</span>
                        <h5 className="text-xs font-bold text-stone-800 mt-1">
                          5 Languages
                        </h5>
                        <p className="text-[11px] text-stone-500 mt-0.5">
                          transcription for global enterprise audio.
                        </p>
                      </div>

                      {/* 3 - Export */}
                      <div className="rounded-xl border border-[#e6e2da] bg-[#faf8f5] p-3">
                        <span className="text-amber-600 font-bold text-xs">03</span>
                        <h5 className="text-xs font-bold text-stone-800 mt-1">
                          Easy Export
                        </h5>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Copy or export your transcription for future use.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Live Transcript Content */}
                {result && (
                  <div className="space-y-3">
                    {isEditing ? (
                      <textarea
                        value={result}
                        onChange={(e) => setResult(e.target.value)}
                        className={`w-full h-[400px] rounded-xl border border-amber-300 bg-[#faf8f5] p-4 font-sans text-stone-800 outline-none focus:ring-2 focus:ring-amber-500/20 focus:bg-white resize-y leading-relaxed ${fontSize === "sm"
                          ? "text-xs"
                          : fontSize === "lg"
                            ? "text-lg"
                            : "text-sm sm:text-base"
                          }`}
                        placeholder="Edit transcript directly..."
                      />
                    ) : (
                      <div
                        className={`whitespace-pre-wrap leading-relaxed select-text font-sans text-stone-800 ${fontSize === "sm"
                          ? "text-xs leading-6"
                          : fontSize === "lg"
                            ? "text-lg leading-8"
                            : "text-sm sm:text-base leading-7"
                          }`}
                      >
                        {highlightedContent || result}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Transcript Footer Bar */}
              {result && (
                <div className="border-t border-[#e7e4dc] bg-[#faf8f5] px-5 py-3 flex items-center justify-between text-xs text-stone-500">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="font-medium text-stone-700">Transcription Complete</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setResult("")}
                      className="text-stone-400 hover:text-rose-600 transition"
                      title="Clear transcript"
                    >
                      Clear
                    </button>
                    <span>•</span>
                    <button
                      onClick={handleCopy}
                      className="text-amber-700 hover:text-amber-800 font-semibold transition"
                    >
                      Copy All
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Keyboard Shortcuts Modal */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-150">

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h4 className="font-bold text-stone-800 text-sm">
                About Somleng-Aksor
              </h4>

              <button
                onClick={() => setShortcutsOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:text-stone-800 hover:bg-stone-100"
              >
                <X size={16} />
              </button>
            </div>

            {/* Project Description */}
            <div className="py-4">
              <p className="text-xs leading-relaxed text-stone-600">
                Somleng-Aksor is a speech-to-text application powered by OpenAI Whisper.
                It converts audio recordings into written text and supports multiple languages. You can easily copy or export
                your transcriptions for future use.
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setShortcutsOpen(false)}
              className="w-full rounded-xl bg-stone-900 hover:bg-stone-800 py-2 text-xs font-bold text-white transition"
            >
              Got it
            </button>

            {/* Footer */}
            <div className="flex justify-between mt-4 pt-3 border-t border-stone-100 text-left">
              <p className="text-[10px] text-stone-400">
                Somleng-Aksor
              </p>
              <p className="text-[11px] font-medium text-stone-600">
                by Llight - k.virakboth
              </p>
            </div>

          </div>
        </div>
      )}

      {/* Studio Footer */}
      <footer className="border-t border-[#e7e4dc] bg-white/70 py-4 px-6 text-center text-xs text-stone-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="rounded-xl font-bold">
            Somleng-Aksor by k.virakboth
          </p>
          <p> Professional AI Speech-to-Text Suite.</p>

          <div className="footer-right">
            <a
              href="https://github.com/LlightBoth"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-github"
              title="GitHub Repository"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path>
                <path d="M9 18c-4.51 2-5-2-7-2"></path>
              </svg>
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
