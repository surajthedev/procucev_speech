// ============================================================
// Procucev AI Voice Studio - Frontend
// Real-time Multilingual STT via Gemini Live WebSocket
// ============================================================

(function () {
  "use strict";

  // ----------------------------------------------------------
  // DOM references
  // ----------------------------------------------------------
  const recordToggleBtn     = document.getElementById("recordToggleBtn");
  const recordBtnLabel      = document.getElementById("recordBtnLabel");
  const languageSelect      = document.getElementById("languageSelect");
  const transcriptDisplay   = document.getElementById("transcriptDisplay");
  const audioVisualizer     = document.getElementById("audioVisualizer");
  const recordingTimer      = document.getElementById("recordingTimer");
  const audioStateText      = document.getElementById("audioStateText");
  const detectedLangText    = document.getElementById("detectedLangText");
  const liveWordCount       = document.getElementById("liveWordCount");
  const liveConfidence      = document.getElementById("liveConfidence");
  const saveToDbBtn         = document.getElementById("saveToDbBtn");
  const copyLiveTranscriptBtn = document.getElementById("copyLiveTranscriptBtn");
  const ttsLiveBtn          = document.getElementById("ttsLiveBtn");
  const clearLiveBtn        = document.getElementById("clearLiveBtn");
  const uploadAudioTriggerBtn = document.getElementById("uploadAudioTriggerBtn");
  const audioFileInput      = document.getElementById("audioFileInput");
  const connectionStatus    = document.getElementById("connectionStatus");
  const connectionStatusText = document.getElementById("connectionStatusText");

  const statTotalTranscriptions = document.getElementById("statTotalTranscriptions");
  const statTotalWords          = document.getElementById("statTotalWords");
  const statAvgConfidence       = document.getElementById("statAvgConfidence");

  const searchInput          = document.getElementById("searchInput");
  const filterLanguageSelect = document.getElementById("filterLanguageSelect");
  const exportCsvBtn         = document.getElementById("exportCsvBtn");
  const exportJsonBtn        = document.getElementById("exportJsonBtn");
  const recordsList          = document.getElementById("recordsList");
  const paginationInfo       = document.getElementById("paginationInfo");
  const prevPageBtn          = document.getElementById("prevPageBtn");
  const nextPageBtn          = document.getElementById("nextPageBtn");
  const currentPageIndicator = document.getElementById("currentPageIndicator");

  const saveModalBackdrop   = document.getElementById("saveModalBackdrop");
  const openManualEntryBtn  = document.getElementById("openManualEntryBtn");
  const closeSaveModalBtn   = document.getElementById("closeSaveModalBtn");
  const cancelSaveModalBtn  = document.getElementById("cancelSaveModalBtn");
  const confirmSaveBtn      = document.getElementById("confirmSaveBtn");
  const saveTitleInput      = document.getElementById("saveTitleInput");
  const saveLanguageSelect  = document.getElementById("saveLanguageSelect");
  const saveContentTextarea = document.getElementById("saveContentTextarea");
  const saveNotesInput      = document.getElementById("saveNotesInput");
  const saveTagsInput       = document.getElementById("saveTagsInput");

  const editModalBackdrop   = document.getElementById("editModalBackdrop");
  const closeEditModalBtn   = document.getElementById("closeEditModalBtn");
  const cancelEditModalBtn  = document.getElementById("cancelEditModalBtn");
  const confirmUpdateBtn    = document.getElementById("confirmUpdateBtn");
  const editRecordId        = document.getElementById("editRecordId");
  const editTitleInput      = document.getElementById("editTitleInput");
  const editLanguageSelect  = document.getElementById("editLanguageSelect");
  const editContentTextarea = document.getElementById("editContentTextarea");
  const editNotesInput      = document.getElementById("editNotesInput");
  const editTagsInput       = document.getElementById("editTagsInput");

  const deleteModalBackdrop  = document.getElementById("deleteModalBackdrop");
  const closeDeleteModalBtn  = document.getElementById("closeDeleteModalBtn");
  const cancelDeleteModalBtn = document.getElementById("cancelDeleteModalBtn");
  const confirmDeleteBtn     = document.getElementById("confirmDeleteBtn");
  const deleteRecordId       = document.getElementById("deleteRecordId");
  const deletePreviewTitle   = document.getElementById("deletePreviewTitle");

  const toastContainer = document.getElementById("toastContainer");

  // ----------------------------------------------------------
  // State
  // ----------------------------------------------------------
  let isRecording        = false;
  let webSocket          = null;
  let audioContext       = null;
  let scriptProcessor    = null;
  let analyserNode       = null;
  let micStream          = null;
  let animationFrameId   = null;
  let timerInterval      = null;
  let timerSeconds       = 0;
  let currentPage        = 1;
  const pageLimit        = 10;
  let totalRecords       = 0;
  let searchDebounce     = null;
  let finalTranscript    = "";
  let interimText        = "";   // shown while user is still speaking (italic)

  // Dual Web Speech API recognisers for Hinglish mode
  let recognizerPrimary   = null;
  let recognizerSecondary = null;

  // Mode flag
  let sttMode = "browser"; // "browser" or "server" (Gemini Live)

  // ----------------------------------------------------------
  // Init
  // ----------------------------------------------------------
  function init() {
    initCanvas();
    connectWebSocket();
    fetchStats();
    fetchRecords();
    setupEventListeners();
    updateSttModeIndicator();
  }

  function updateSttModeIndicator() {
    // Inform user which STT mode is active based on server health
    fetch("/health")
      .then(r => r.json())
      .then(data => {
        if (data.gemini_api_key_configured) {
          sttMode = "server";
          audioStateText.textContent = "Server-side Gemini Live STT ready. Click Start Recording.";
          showToast("Server-side Gemini Live STT is active.", "success");
        } else {
          sttMode = "browser";
          audioStateText.textContent = "Browser STT active (dual-recogniser Hinglish mode). Set GEMINI_API_KEY for server STT.";
          showToast("GEMINI_API_KEY not set — using dual-language browser STT.", "info");
        }
      })
      .catch(() => {
        sttMode = "browser";
      });
  }

  // ----------------------------------------------------------
  // Canvas Visualiser
  // ----------------------------------------------------------
  const canvasCtx = audioVisualizer.getContext("2d");
  let simPhase = 0;

  function initCanvas() {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    drawIdle();
  }

  function resizeCanvas() {
    audioVisualizer.width  = (audioVisualizer.offsetWidth  || 600) * window.devicePixelRatio;
    audioVisualizer.height = (audioVisualizer.offsetHeight || 110) * window.devicePixelRatio;
  }

  function drawIdle() {
    if (isRecording) return;
    const { width, height } = audioVisualizer;
    canvasCtx.clearRect(0, 0, width, height);
    canvasCtx.beginPath();
    canvasCtx.strokeStyle = "rgba(99,102,241,0.25)";
    canvasCtx.lineWidth = 2;
    canvasCtx.moveTo(0, height / 2);
    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();
  }

  function renderFrame() {
    if (!isRecording) return;
    const { width, height } = audioVisualizer;
    canvasCtx.clearRect(0, 0, width, height);
    canvasCtx.lineWidth = 2.5;

    const grad = canvasCtx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, "#6366f1");
    grad.addColorStop(0.5, "#ec4899");
    grad.addColorStop(1, "#8b5cf6");
    canvasCtx.strokeStyle = grad;
    canvasCtx.beginPath();

    if (analyserNode) {
      const buf = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteTimeDomainData(buf);
      const sw = width / buf.length;
      buf.forEach((v, i) => {
        const y = (v / 128) * (height / 2);
        i === 0 ? canvasCtx.moveTo(0, y) : canvasCtx.lineTo(i * sw, y);
      });
    } else {
      simPhase += 0.08;
      for (let x = 0; x < width; x += 4) {
        const env = Math.sin((x / width) * Math.PI);
        const y = height / 2 + Math.sin(x * 0.05 + simPhase) * 25 * env;
        x === 0 ? canvasCtx.moveTo(x, y) : canvasCtx.lineTo(x, y);
      }
    }
    canvasCtx.stroke();
    animationFrameId = requestAnimationFrame(renderFrame);
  }

  // ----------------------------------------------------------
  // WebSocket — Gemini Live server-side STT
  // ----------------------------------------------------------
  function connectWebSocket() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    try {
      webSocket = new WebSocket(`${proto}//${location.host}/ws/transcribe`);

      webSocket.onopen = () => {
        setConnectionStatus(true);
        // Tell server current language preference
        webSocket.send(JSON.stringify({ type: "config", language: languageSelect.value }));
      };

      webSocket.onmessage = (ev) => {
        let data;
        try { data = JSON.parse(ev.data); } catch { return; }

        if (data.type === "ready") {
          audioStateText.textContent = data.message || "Gemini Live STT connected.";
        } else if (data.type === "transcript") {
          appendTranscript(data.text, data.is_final);
        } else if (data.type === "error") {
          showToast("Server STT error: " + data.message, "error");
        }
      };

      webSocket.onclose = () => {
        setConnectionStatus(false);
        setTimeout(connectWebSocket, 3000);
      };

      webSocket.onerror = () => setConnectionStatus(false);
    } catch (e) {
      setConnectionStatus(false);
    }
  }

  function setConnectionStatus(online) {
    connectionStatus.querySelector(".status-dot").className = `status-dot ${online ? "online" : "offline"}`;
    connectionStatusText.textContent = online ? "Server Connected" : "Server Offline";
  }

  // ----------------------------------------------------------
  // DUAL-LANGUAGE Browser STT (Hinglish Mode)
  // ----------------------------------------------------------
  // Web Speech API cannot handle two languages simultaneously.
  // The workaround: run two parallel recognisers, one set to hi-IN
  // and one to en-IN; merge results by timestamp into a single stream.
  // This correctly captures mixed Hinglish sentences.
  // ----------------------------------------------------------

  function buildRecogniser(lang) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous      = true;
    r.interimResults  = true;
    r.maxAlternatives = 1;
    r.lang            = lang;
    return r;
  }

  function startBrowserSTT() {
    const selected = languageSelect.value;

    if (selected === "hinglish" || selected === "auto") {
      // Dual-recogniser mode for mixed Hindi + English
      recognizerPrimary   = buildRecogniser("hi-IN");
      recognizerSecondary = buildRecogniser("en-IN");

      attachRecogniserHandlers(recognizerPrimary, "Hindi");
      attachRecogniserHandlers(recognizerSecondary, "English");

      tryStart(recognizerPrimary);
      // Stagger secondary slightly to reduce overlap on Chrome
      setTimeout(() => tryStart(recognizerSecondary), 300);

      audioStateText.textContent = "Dual-language mode (hi-IN + en-IN) — speak freely in Hindi, English, or both.";
    } else {
      // Single language mode
      const langMap = { "hi-IN": "hi-IN", "en-IN": "en-IN", "en-US": "en-US" };
      recognizerPrimary = buildRecogniser(langMap[selected] || "en-IN");
      attachRecogniserHandlers(recognizerPrimary, selected);
      tryStart(recognizerPrimary);
      audioStateText.textContent = `Recording in ${selected} mode...`;
    }
  }

  function attachRecogniserHandlers(rec, label) {
    if (!rec) return;

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalTranscript += (finalTranscript ? " " : "") + res[0].transcript.trim();
          const conf = Math.round((res[0].confidence || 0.95) * 100);
          liveConfidence.textContent = conf + "%";
          // Also forward final text to server for language analysis
          if (webSocket && webSocket.readyState === WebSocket.OPEN) {
            webSocket.send(JSON.stringify({ type: "config", language: languageSelect.value }));
          }
        } else {
          interim += res[0].transcript;
        }
      }
      interimText = interim;
      refreshTranscriptDisplay();
    };

    rec.onerror = (ev) => {
      if (ev.error === "not-allowed") {
        showToast("Microphone access denied.", "error");
        stopRecording();
      }
    };

    rec.onend = () => {
      if (isRecording) {
        // Auto-restart for continuous listening
        try { rec.start(); } catch (_) {}
      }
    };
  }

  function tryStart(rec) {
    if (!rec) return;
    try { rec.start(); } catch (_) {}
  }

  function stopBrowserSTT() {
    [recognizerPrimary, recognizerSecondary].forEach(r => {
      if (r) { try { r.stop(); } catch (_) {} }
    });
    recognizerPrimary = recognizerSecondary = null;
  }

  // ----------------------------------------------------------
  // Server-side STT via Gemini Live (PCM streaming over WebSocket)
  // ----------------------------------------------------------
  function startServerSTT() {
    if (!micStream || !audioContext) return;

    audioStateText.textContent = "Streaming audio to Gemini Live STT...";

    // Tell server we are starting
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
      webSocket.send(JSON.stringify({ type: "config", language: languageSelect.value }));
    }

    // ScriptProcessor: capture PCM chunks and send over WebSocket
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    const source = audioContext.createMediaStreamSource(micStream);

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    source.connect(analyserNode);
    source.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    scriptProcessor.onaudioprocess = (ev) => {
      if (!webSocket || webSocket.readyState !== WebSocket.OPEN) return;
      const raw = ev.inputBuffer.getChannelData(0);
      // Convert Float32 to Int16 PCM
      const pcm = new Int16Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        pcm[i] = Math.max(-32768, Math.min(32767, raw[i] * 32768));
      }
      const b64 = btoa(String.fromCharCode(...new Uint8Array(pcm.buffer)));
      webSocket.send(JSON.stringify({ type: "audio", data: b64 }));
    };
  }

  function stopServerSTT() {
    if (scriptProcessor) {
      scriptProcessor.disconnect();
      scriptProcessor = null;
    }
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
      webSocket.send(JSON.stringify({ type: "end" }));
    }
  }

  // ----------------------------------------------------------
  // Recording Toggle
  // ----------------------------------------------------------
  async function startRecording() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      showToast("Microphone access denied: " + err.message, "error");
      return;
    }

    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

    isRecording = true;
    recordToggleBtn.classList.add("recording");
    recordBtnLabel.textContent = "Stop Recording";
    startTimer();
    renderFrame();

    if (sttMode === "server") {
      startServerSTT();
    } else {
      // Browser STT — still set up analyser for waveform
      const source = audioContext.createMediaStreamSource(micStream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      source.connect(analyserNode);
      startBrowserSTT();
    }
  }

  function stopRecording() {
    isRecording = false;
    recordToggleBtn.classList.remove("recording");
    recordBtnLabel.textContent = "Start Recording";
    audioStateText.textContent = "Recording stopped. Review transcript, then save.";
    stopTimer();
    cancelAnimationFrame(animationFrameId);
    drawIdle();

    if (sttMode === "server") {
      stopServerSTT();
    } else {
      stopBrowserSTT();
    }

    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
      analyserNode = null;
    }
  }

  // ----------------------------------------------------------
  // Transcript Display — XSS-safe
  // ----------------------------------------------------------
  function appendTranscript(text, isFinal) {
    if (!text) return;
    if (isFinal) {
      finalTranscript += (finalTranscript ? " " : "") + text.trim();
      interimText = "";
    } else {
      interimText = text;
    }
    refreshTranscriptDisplay();
  }

  function refreshTranscriptDisplay() {
    // XSS-safe: build DOM nodes instead of using innerHTML with raw text
    transcriptDisplay.textContent = "";

    const frag = document.createDocumentFragment();

    if (finalTranscript) {
      frag.appendChild(document.createTextNode(finalTranscript));
    }

    if (interimText) {
      if (finalTranscript) frag.appendChild(document.createTextNode(" "));
      const span = document.createElement("span");
      span.style.cssText = "color:#94a3b8;font-style:italic;";
      span.textContent = interimText;
      frag.appendChild(span);
    }

    transcriptDisplay.appendChild(frag);

    const rawText = (finalTranscript + " " + interimText).trim();
    liveWordCount.textContent = rawText ? rawText.split(/\s+/).length : 0;
    detectedLangText.textContent = detectScript(rawText);
  }

  function detectScript(text) {
    if (!text || !text.trim()) return "Pending";
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    const hasLatin = /[a-zA-Z]/.test(text);
    if (hasDevanagari && hasLatin) return "Hinglish (Mixed Script)";
    if (hasDevanagari) return "Hindi (Devanagari)";
    if (hasLatin) {
      const kws = ["hai","ho","kya","kar","rahe","kaise","bhai","acha","theek","nahi","samajh","aaj","matlab","haan"];
      if (text.toLowerCase().split(/\s+/).some(w => kws.includes(w))) return "Hinglish (Roman Script)";
      return "English";
    }
    return "Multilingual";
  }

  // ----------------------------------------------------------
  // Timer
  // ----------------------------------------------------------
  function startTimer() {
    timerSeconds = 0;
    tick();
    timerInterval = setInterval(tick, 1000);
  }
  function tick() {
    timerSeconds++;
    const m = String(Math.floor(timerSeconds / 60)).padStart(2, "0");
    const s = String(timerSeconds % 60).padStart(2, "0");
    recordingTimer.textContent = `${m}:${s}`;
  }
  function stopTimer() {
    clearInterval(timerInterval);
  }

  // ----------------------------------------------------------
  // Text-to-Speech
  // ----------------------------------------------------------
  function playTTS(text, langCode) {
    if (!text || !text.trim()) {
      showToast("No text to play.", "error");
      return;
    }
    fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim(), language: langCode || "hi" }),
    })
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(blob => new Audio(URL.createObjectURL(blob)).play())
      .catch(() => {
        if ("speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = "hi-IN";
          speechSynthesis.speak(u);
        } else {
          showToast("TTS unavailable.", "error");
        }
      });
  }

  // ----------------------------------------------------------
  // CRUD — Fetch Records
  // ----------------------------------------------------------
  function fetchRecords() {
    const search   = searchInput.value.trim();
    const language = filterLanguageSelect.value;

    let url = `/api/transcriptions?page=${currentPage}&limit=${pageLimit}&sort_by=created_at&sort_order=desc`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (language && language !== "all") url += `&language=${encodeURIComponent(language)}`;

    recordsList.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading records...</p></div>`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        totalRecords = data.total;
        renderRecords(data.items);
        updatePagination();
      })
      .catch(() => {
        recordsList.innerHTML = `<div class="empty-state"><p>Failed to load. Check server.</p></div>`;
      });
  }

  function renderRecords(items) {
    if (!items || items.length === 0) {
      recordsList.innerHTML = `<div class="empty-state"><p>No transcriptions yet. Record speech or click New Note.</p></div>`;
      return;
    }

    recordsList.innerHTML = "";
    items.forEach(record => {
      const el = buildRecordElement(record);
      recordsList.appendChild(el);
    });
  }

  function buildRecordElement(record) {
    const item = document.createElement("div");
    item.className = "record-item";

    const langLower = (record.language || "").toLowerCase();
    const langClass = langLower.includes("eng") ? "english"
                    : langLower.includes("hin") && !langLower.includes("hing") ? "hindi"
                    : "hinglish";

    // Header row
    const header = document.createElement("div");
    header.className = "record-header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "record-title-group";

    const titleEl = document.createElement("h4");
    titleEl.className = "record-title";
    titleEl.textContent = record.title || "Untitled";   // safe textContent, no XSS

    const badge = document.createElement("span");
    badge.className = `lang-badge ${langClass}`;
    badge.textContent = record.language || "Auto";      // safe

    titleGroup.appendChild(titleEl);
    titleGroup.appendChild(badge);

    const actions = document.createElement("div");
    actions.className = "record-actions";

    // TTS button
    const ttsBtn = makeIconBtn("TTS", "M11 5 6 9 2 9 2 15 6 15 11 19 11 5Z M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07");
    ttsBtn.addEventListener("click", () => playTTS(record.content, record.language));

    // Copy button
    const copyBtn = makeIconBtn("Copy", "M9 9h13v13H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(record.content);
      showToast("Copied to clipboard.", "success");
    });

    // Edit button
    const editBtn = makeIconBtn("Edit", "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z");
    editBtn.addEventListener("click", () => openEditModal(record.id));

    // Delete button
    const delBtn = makeIconBtn("Delete", "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2");
    delBtn.addEventListener("click", () => openDeleteModal(record.id, record.title));

    [ttsBtn, copyBtn, editBtn, delBtn].forEach(b => actions.appendChild(b));
    header.appendChild(titleGroup);
    header.appendChild(actions);

    // Content
    const content = document.createElement("div");
    content.className = "record-content";
    content.textContent = record.content;   // textContent — no XSS

    // Footer meta
    const meta = document.createElement("div");
    meta.className = "record-meta-footer";

    const metaTags = document.createElement("div");
    metaTags.className = "record-meta-tags";
    metaTags.textContent = `Words: ${record.word_count || 0}  |  Confidence: ${Math.round((record.confidence || 0.95) * 100)}%` +
                           (record.tags ? `  |  ${record.tags}` : "");

    const metaDate = document.createElement("div");
    metaDate.className = "record-timestamp";
    metaDate.textContent = record.created_at ? new Date(record.created_at).toLocaleString() : "";

    meta.appendChild(metaTags);
    meta.appendChild(metaDate);

    item.appendChild(header);
    item.appendChild(content);
    item.appendChild(meta);
    return item;
  }

  function makeIconBtn(title, svgPath) {
    const btn = document.createElement("button");
    btn.className = "icon-btn";
    btn.title = title;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${svgPath}"></path></svg>`;
    return btn;
  }

  function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageLimit));
    const start = totalRecords === 0 ? 0 : (currentPage - 1) * pageLimit + 1;
    const end   = Math.min(currentPage * pageLimit, totalRecords);
    paginationInfo.textContent = `Showing ${start}-${end} of ${totalRecords}`;
    currentPageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
  }

  // ----------------------------------------------------------
  // CRUD — Stats
  // ----------------------------------------------------------
  function fetchStats() {
    fetch("/api/transcriptions/stats/summary")
      .then(r => r.json())
      .then(d => {
        statTotalTranscriptions.textContent = d.total_transcriptions || 0;
        statTotalWords.textContent = (d.total_words || 0).toLocaleString();
        statAvgConfidence.textContent = Math.round((d.average_confidence || 0.95) * 100) + "%";
      })
      .catch(() => {});
  }

  // ----------------------------------------------------------
  // CRUD — Save modal
  // ----------------------------------------------------------
  function openSaveModalFromStudio() {
    const text = transcriptDisplay.innerText.trim();
    if (!text) { showToast("No transcribed text to save.", "error"); return; }
    saveTitleInput.value = "Recording - " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    saveContentTextarea.value = text;
    saveLanguageSelect.value = detectScript(text).includes("Hindi") ? "Hindi" : detectScript(text).includes("English") ? "English" : "Hinglish";
    saveNotesInput.value = "";
    saveTagsInput.value = "";
    saveModalBackdrop.classList.add("open");
  }

  function openManualSaveModal() {
    saveTitleInput.value = saveContentTextarea.value = saveNotesInput.value = saveTagsInput.value = "";
    saveLanguageSelect.value = "Hinglish";
    saveModalBackdrop.classList.add("open");
  }

  function closeSaveModal() { saveModalBackdrop.classList.remove("open"); }

  function handleSaveConfirm() {
    const content = saveContentTextarea.value.trim();
    if (!content) { showToast("Content cannot be empty.", "error"); return; }

    fetch("/api/transcriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: saveTitleInput.value.trim() || "Untitled",
        content,
        language: saveLanguageSelect.value,
        notes: saveNotesInput.value.trim(),
        tags: saveTagsInput.value.trim(),
        duration_seconds: timerSeconds,
        confidence: parseFloat(liveConfidence.textContent) / 100 || 0.95,
      }),
    })
      .then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.detail); }); return r.json(); })
      .then(() => { closeSaveModal(); showToast("Saved to database.", "success"); fetchStats(); currentPage = 1; fetchRecords(); })
      .catch(e => showToast(e.message, "error"));
  }

  // ----------------------------------------------------------
  // CRUD — Edit modal
  // ----------------------------------------------------------
  function openEditModal(id) {
    fetch(`/api/transcriptions/${id}`)
      .then(r => r.json())
      .then(rec => {
        editRecordId.value = rec.id;
        editTitleInput.value = rec.title || "";
        editLanguageSelect.value = rec.language || "Hinglish";
        editContentTextarea.value = rec.content || "";
        editNotesInput.value = rec.notes || "";
        editTagsInput.value = rec.tags || "";
        editModalBackdrop.classList.add("open");
      })
      .catch(() => showToast("Could not load record.", "error"));
  }

  function closeEditModal() { editModalBackdrop.classList.remove("open"); }

  function handleUpdateConfirm() {
    const id      = editRecordId.value;
    const content = editContentTextarea.value.trim();
    if (!content) { showToast("Content cannot be empty.", "error"); return; }

    fetch(`/api/transcriptions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title:    editTitleInput.value.trim(),
        content,
        language: editLanguageSelect.value,
        notes:    editNotesInput.value.trim(),
        tags:     editTagsInput.value.trim(),
      }),
    })
      .then(r => { if (!r.ok) throw new Error("Update failed"); return r.json(); })
      .then(() => { closeEditModal(); showToast("Record updated.", "success"); fetchStats(); fetchRecords(); })
      .catch(e => showToast(e.message, "error"));
  }

  // ----------------------------------------------------------
  // CRUD — Delete modal
  // ----------------------------------------------------------
  function openDeleteModal(id, title) {
    deleteRecordId.value = id;
    deletePreviewTitle.textContent = `Record #${id}: "${title}"`;
    deleteModalBackdrop.classList.add("open");
  }

  function closeDeleteModal() { deleteModalBackdrop.classList.remove("open"); }

  function handleDeleteConfirm() {
    const id = deleteRecordId.value;
    fetch(`/api/transcriptions/${id}`, { method: "DELETE" })
      .then(r => { if (!r.ok) throw new Error("Delete failed"); return r.json(); })
      .then(() => { closeDeleteModal(); showToast("Record deleted.", "success"); fetchStats(); fetchRecords(); })
      .catch(e => showToast(e.message, "error"));
  }

  // ----------------------------------------------------------
  // Audio Upload
  // ----------------------------------------------------------
  function handleAudioUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("language_hint", languageSelect.value);
    formData.append("auto_save", "true");

    showToast("Uploading to Gemini for transcription...", "info");

    fetch("/api/transcribe/upload", { method: "POST", body: formData })
      .then(r => {
        if (!r.ok) return r.json().then(e => { throw new Error(e.detail || "Upload failed"); });
        return r.json();
      })
      .then(data => {
        finalTranscript = data.transcription;
        interimText = "";
        refreshTranscriptDisplay();
        showToast("Audio transcribed via Gemini.", "success");
        fetchStats();
        fetchRecords();
      })
      .catch(e => showToast("Error: " + e.message, "error"))
      .finally(() => { audioFileInput.value = ""; });
  }

  // ----------------------------------------------------------
  // Toast
  // ----------------------------------------------------------
  function showToast(msg, type = "info") {
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;   // textContent — safe
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 250);
    }, 4000);
  }

  // ----------------------------------------------------------
  // Event Listeners
  // ----------------------------------------------------------
  function setupEventListeners() {
    recordToggleBtn.addEventListener("click", () => { isRecording ? stopRecording() : startRecording(); });

    languageSelect.addEventListener("change", () => {
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({ type: "config", language: languageSelect.value }));
      }
    });

    saveToDbBtn.addEventListener("click", openSaveModalFromStudio);
    openManualEntryBtn.addEventListener("click", openManualSaveModal);
    closeSaveModalBtn.addEventListener("click", closeSaveModal);
    cancelSaveModalBtn.addEventListener("click", closeSaveModal);
    confirmSaveBtn.addEventListener("click", handleSaveConfirm);

    closeEditModalBtn.addEventListener("click", closeEditModal);
    cancelEditModalBtn.addEventListener("click", closeEditModal);
    confirmUpdateBtn.addEventListener("click", handleUpdateConfirm);

    closeDeleteModalBtn.addEventListener("click", closeDeleteModal);
    cancelDeleteModalBtn.addEventListener("click", closeDeleteModal);
    confirmDeleteBtn.addEventListener("click", handleDeleteConfirm);

    copyLiveTranscriptBtn.addEventListener("click", () => {
      const t = transcriptDisplay.innerText.trim();
      if (!t) { showToast("Nothing to copy.", "error"); return; }
      navigator.clipboard.writeText(t);
      showToast("Copied.", "success");
    });

    ttsLiveBtn.addEventListener("click", () => playTTS(transcriptDisplay.innerText.trim(), languageSelect.value));

    clearLiveBtn.addEventListener("click", () => {
      finalTranscript = interimText = "";
      transcriptDisplay.textContent = "";
      liveWordCount.textContent = "0";
      detectedLangText.textContent = "Pending";
      showToast("Transcript cleared.", "info");
    });

    uploadAudioTriggerBtn.addEventListener("click", () => audioFileInput.click());
    audioFileInput.addEventListener("change", handleAudioUpload);

    searchInput.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => { currentPage = 1; fetchRecords(); }, 300);
    });
    filterLanguageSelect.addEventListener("change", () => { currentPage = 1; fetchRecords(); });

    prevPageBtn.addEventListener("click", () => { if (currentPage > 1) { currentPage--; fetchRecords(); } });
    nextPageBtn.addEventListener("click", () => { currentPage++; fetchRecords(); });

    exportCsvBtn.addEventListener("click", () => { location.href = "/api/transcriptions/export/data?format_type=csv"; });
    exportJsonBtn.addEventListener("click", () => { location.href = "/api/transcriptions/export/data?format_type=json"; });

    [saveModalBackdrop, editModalBackdrop, deleteModalBackdrop].forEach(bd => {
      bd.addEventListener("click", e => { if (e.target === bd) bd.classList.remove("open"); });
    });
  }

  // ----------------------------------------------------------
  // Boot
  // ----------------------------------------------------------
  document.addEventListener("DOMContentLoaded", init);
})();
