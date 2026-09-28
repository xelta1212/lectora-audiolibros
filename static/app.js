const $ = (id) => document.getElementById(id);

const dropZone = $("dropZone");
const fileInput = $("fileInput");
const fileMeta = $("fileMeta");
const fileName = $("fileName");
const fileStats = $("fileStats");
const removeFile = $("removeFile");
const cleanPdf = $("cleanPdf");
const extractButton = $("extractButton");
const textEditor = $("textEditor");
const wordCount = $("wordCount");
const charCount = $("charCount");
const clearText = $("clearText");
const voiceSelect = $("voiceSelect");
const speedRange = $("speedRange");
const speedValue = $("speedValue");
const generateButton = $("generateButton");
const audioEmpty = $("audioEmpty");
const audioResult = $("audioResult");
const audioPlayer = $("audioPlayer");
const downloadLink = $("downloadLink");
const readyBadge = $("readyBadge");
const statusBar = $("statusBar");
const statusTitle = $("statusTitle");
const statusText = $("statusText");
const historyEmpty = $("historyEmpty");
const historyList = $("historyList");
const clearHistory = $("clearHistory");

let selectedFile = null;
let audioUrl = null;

// ──────────────────────────────────────────────
//  INDEXEDDB — almacenamiento de historial
// ──────────────────────────────────────────────
const DB_NAME = "lectora-history";
const DB_VERSION = 1;
const STORE = "audiobooks";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbSave(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("createdAt").getAll();
    req.onsuccess = (e) => resolve(e.result.reverse()); // más reciente primero
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function dbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

// ──────────────────────────────────────────────
//  HISTORIAL — UI
// ──────────────────────────────────────────────
const VOICE_LABELS = {
  "es-PE-CamilaNeural": "Camila · PE",
  "es-PE-AlexNeural":   "Alex · PE",
  "es-MX-DaliaNeural":  "Dalia · MX",
  "es-MX-JorgeNeural":  "Jorge · MX",
  "es-ES-ElviraNeural": "Elvira · ES",
  "es-ES-AlvaroNeural": "Álvaro · ES",
};

function formatDate(ts) {
  return new Date(ts).toLocaleString("es-PE", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function buildHistoryItem(entry) {
  const blobUrl = URL.createObjectURL(
    new Blob([entry.audioData], { type: "audio/mpeg" })
  );

  const li = document.createElement("li");
  li.className = "history-item";
  li.dataset.id = entry.id;

  li.innerHTML = `
    <div class="history-item-header">
      <div>
        <div class="history-item-title" title="${entry.title}">${entry.title}</div>
        <div class="history-item-date">${formatDate(entry.createdAt)}</div>
      </div>
    </div>
    <div class="history-item-meta">
      <span class="history-chip">${VOICE_LABELS[entry.voice] || entry.voice}</span>
      <span class="history-chip">${entry.rate > 0 ? "+" : ""}${entry.rate}% vel.</span>
      <span class="history-chip">${(entry.words || 0).toLocaleString("es-PE")} palabras</span>
    </div>
    <audio class="history-item-audio" controls preload="metadata" src="${blobUrl}"></audio>
    <div class="history-item-actions">
      <a class="history-download" href="${blobUrl}" download="${entry.title}.mp3">
        <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>
        Descargar
      </a>
      <button class="history-delete" title="Eliminar" aria-label="Eliminar entrada">🗑</button>
    </div>
  `;

  li.querySelector(".history-delete").addEventListener("click", async () => {
    await dbDelete(entry.id);
    // Revocar blob URL al eliminar para liberar memoria
    URL.revokeObjectURL(blobUrl);
    li.style.transition = "opacity .2s, transform .2s";
    li.style.opacity = "0";
    li.style.transform = "translateY(-6px)";
    setTimeout(() => {
      li.remove();
      if (!historyList.children.length) {
        historyList.classList.add("hidden");
        historyEmpty.classList.remove("hidden");
      }
    }, 220);
  });

  return li;
}

async function renderHistory() {
  const entries = await dbGetAll();
  historyList.innerHTML = "";

  if (!entries.length) {
    historyEmpty.classList.remove("hidden");
    historyList.classList.add("hidden");
    return;
  }

  historyEmpty.classList.add("hidden");
  historyList.classList.remove("hidden");
  entries.forEach(entry => historyList.appendChild(buildHistoryItem(entry)));
}

async function saveToHistory(title, blob, voice, rate, words) {
  const arrayBuffer = await blob.arrayBuffer();
  const record = {
    id: Date.now().toString(),
    createdAt: Date.now(),
    title,
    voice,
    rate: Number(rate),
    words: Number(words),
    audioData: arrayBuffer,
  };
  await dbSave(record);
  // Insertar al principio de la lista sin re-renderizar todo
  const item = buildHistoryItem({ ...record });
  if (historyList.classList.contains("hidden")) {
    historyEmpty.classList.add("hidden");
    historyList.classList.remove("hidden");
  }
  historyList.prepend(item);
}

clearHistory.addEventListener("click", async () => {
  if (!confirm("¿Quieres eliminar todo el historial de audiolibros?")) return;
  await dbClear();
  historyList.innerHTML = "";
  historyList.classList.add("hidden");
  historyEmpty.classList.remove("hidden");
});

// ──────────────────────────────────────────────
//  UTILIDADES
// ──────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B","KB","MB","GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function updateCounts() {
  const text = textEditor.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  wordCount.textContent = `${words.toLocaleString("es-PE")} palabras`;
  charCount.textContent = `${text.length.toLocaleString("es-PE")} caracteres`;
  generateButton.disabled = text.length === 0;
}

function showStatus(title, text) {
  statusTitle.textContent = title;
  statusText.textContent = text;
  statusBar.classList.remove("hidden");
}

function hideStatus() {
  statusBar.classList.add("hidden");
}

function resetAudio() {
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
  audioPlayer.removeAttribute("src");
  downloadLink.removeAttribute("href");
  audioResult.classList.add("hidden");
  audioEmpty.classList.remove("hidden");
  readyBadge.textContent = "Pendiente";
  readyBadge.classList.add("muted");
}

function setSelectedFile(file) {
  const ext = file.name.toLowerCase().split(".").pop();
  if (!["pdf", "txt"].includes(ext)) {
    alert("Solo puedes usar archivos PDF o TXT.");
    return;
  }
  selectedFile = file;
  fileName.textContent = file.name;
  fileStats.textContent = `${formatBytes(file.size)} · listo para procesar`;
  fileMeta.classList.remove("hidden");
  dropZone.classList.add("hidden");  // oculta la zona de drop
  extractButton.disabled = false;
}

// ──────────────────────────────────────────────
//  EVENTOS — CARGA DE ARCHIVOS
// ──────────────────────────────────────────────
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) setSelectedFile(fileInput.files[0]);
});

["dragenter","dragover"].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
});
["dragleave","drop"].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  });
});
dropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) setSelectedFile(file);
});

removeFile.addEventListener("click", () => {
  selectedFile = null;
  fileInput.value = "";
  fileMeta.classList.add("hidden");
  dropZone.classList.remove("hidden");  // muestra la zona de drop de nuevo
  extractButton.disabled = true;
});

// ──────────────────────────────────────────────
//  EVENTOS — EXTRACCIÓN
// ──────────────────────────────────────────────
extractButton.addEventListener("click", async () => {
  if (!selectedFile) return;

  showStatus("Extrayendo texto", "Leyendo el archivo y preparando una versión editable...");
  extractButton.disabled = true;

  try {
    const form = new FormData();
    form.append("file", selectedFile);
    form.append("clean_pdf", cleanPdf.checked ? "true" : "false");

    const res = await fetch("/api/extract", { method: "POST", body: form });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || "No se pudo leer el archivo.");

    textEditor.value = data.text;
    updateCounts();
    fileStats.textContent = `${formatBytes(selectedFile.size)} · ${data.words.toLocaleString("es-PE")} palabras`;
    resetAudio();

    document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    alert(err.message);
  } finally {
    extractButton.disabled = false;
    hideStatus();
  }
});

textEditor.addEventListener("input", () => {
  updateCounts();
  resetAudio();
});

clearText.addEventListener("click", () => {
  if (!textEditor.value) return;
  if (confirm("¿Quieres borrar todo el texto del editor?")) {
    textEditor.value = "";
    updateCounts();
    resetAudio();
  }
});

speedRange.addEventListener("input", () => {
  const value = Number(speedRange.value);
  speedValue.textContent = `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}%`;
});

// ──────────────────────────────────────────────
//  EVENTOS — GENERACIÓN DE AUDIO
// ──────────────────────────────────────────────
generateButton.addEventListener("click", async () => {
  const text = textEditor.value.trim();
  if (!text) return;

  showStatus("Generando audiolibro", "La voz se está creando. No cierres esta pestaña.");
  generateButton.disabled = true;

  try {
    const form = new FormData();
    form.append("text", text);
    form.append("voice", voiceSelect.value);
    form.append("rate", speedRange.value);

    const res = await fetch("/api/generate", { method: "POST", body: form });

    if (!res.ok) {
      let detail = "No se pudo generar el audio.";
      try {
        const data = await res.json();
        detail = data.detail || detail;
      } catch {}
      throw new Error(detail);
    }

    const blob = await res.blob();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(blob);

    audioPlayer.src = audioUrl;
    downloadLink.href = audioUrl;

    const baseName = selectedFile
      ? selectedFile.name.replace(/\.(pdf|txt)$/i, "")
      : "audiolibro";
    downloadLink.download = `${baseName}.mp3`;

    audioEmpty.classList.add("hidden");
    audioResult.classList.remove("hidden");
    readyBadge.textContent = "Listo";
    readyBadge.classList.remove("muted");

    document.querySelector("#audioCard").scrollIntoView({ behavior: "smooth", block: "center" });

    // Guardar en historial (usando el blob original, no la URL revocable)
    const words = text.split(/\s+/).length;
    await saveToHistory(baseName, blob, voiceSelect.value, speedRange.value, words);

  } catch (err) {
    alert(err.message);
  } finally {
    generateButton.disabled = textEditor.value.trim().length === 0;
    hideStatus();
  }
});

// ──────────────────────────────────────────────
//  INICIO
// ──────────────────────────────────────────────
updateCounts();
renderHistory();