import { MP_VERSION } from "./core/vision.js";
import maos from "./modes/maos.js";
import rosto from "./modes/rosto.js";
import corpo from "./modes/corpo.js";
import objetos from "./modes/objetos.js";
import fundo from "./modes/fundo.js";

const MODES = [maos, rosto, corpo, objetos, fundo];

// ---------- Elementos ----------
const $ = (id) => document.getElementById(id);
const stage = $("stage");
const video = $("webcam");
const overlay = $("overlay");
const ctx = overlay.getContext("2d");
const drawCanvas = $("drawCanvas");
const drawCtx = drawCanvas.getContext("2d");
const emptyState = $("emptyState");
const loading = $("loading");
const hud = $("hud");
const fpsPill = $("fpsPill");
const msPill = $("msPill");
const startBtn = $("startBtn");
const camBtn = $("camBtn");
const cameraSelect = $("cameraSelect");
const mirrorToggle = $("mirrorToggle");
const overlayToggle = $("overlayToggle");
const shotBtn = $("shotBtn");
const tabs = $("tabs");
const modeTitle = $("modeTitle");
const modeHint = $("modeHint");
const modePanel = $("modePanel");
const toastEl = $("toast");
const flipBtn = $("flipBtn");
const panel = $("panel");
const sheetHandle = $("sheetHandle");

$("mpVersion").textContent = MP_VERSION;

// ---------- Estado ----------
const state = {
  mode: null,
  ready: false,
  stream: null,
  running: false,
  mirrored: true,
  deviceId: null,
  lastVideoTime: -1,
  lastUi: 0,
  fps: 0,
  ms: 0,
  lastFrameAt: 0,
  loadToken: 0,
  looping: false,
};

const store = {
  get(k) { try { return localStorage.getItem("frepof-" + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("frepof-" + k, v); } catch {} },
};

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

// ---------- Abas ----------
MODES.forEach((m, i) => {
  const b = document.createElement("button");
  b.className = "tab";
  b.type = "button";
  b.setAttribute("role", "tab");
  b.dataset.mode = m.id;
  b.title = `${m.label} (${i + 1})`;
  b.innerHTML = `${m.icon}<span>${m.label}</span>`;
  b.addEventListener("click", () => selectMode(m.id));
  tabs.append(b);
});

function modeById(id) {
  return MODES.find((m) => m.id === id) || MODES[0];
}

async function selectMode(id) {
  const next = modeById(id);
  if (state.mode === next) return;

  // Libera o modo anterior
  if (state.mode) {
    state.mode.dispose?.();
  }
  state.mode = next;
  state.ready = false;
  const token = ++state.loadToken;

  if (location.hash !== "#" + next.id) history.replaceState(null, "", "#" + next.id);
  store.set("mode", next.id);

  tabs.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.mode === next.id)));
  modeTitle.textContent = next.title;
  modeHint.textContent = next.hint;
  modePanel.replaceChildren();
  next.mount(modePanel, api);

  ctx.clearRect(0, 0, overlay.width, overlay.height);
  stage.classList.toggle("show-drawing", !!next.usesDrawing);

  showLoading(`Carregando modelo de ${next.label.toLowerCase()}…`);
  try {
    await next.load();
    if (token !== state.loadToken) { next.dispose?.(); return; } // o usuário trocou de modo no meio
    state.ready = true;
    hideLoading();
  } catch (err) {
    console.error(err);
    if (token !== state.loadToken) return;
    showError("Falha ao baixar o modelo", () => {
      state.mode = null;
      selectMode(next.id);
    });
  }
}

function showLoading(text) {
  loading.classList.remove("error");
  loading.innerHTML = `<span class="spinner"></span><span>${text}</span>`;
  loading.hidden = false;
}
function hideLoading() {
  loading.hidden = true;
}
function showError(text, retry) {
  loading.classList.add("error");
  loading.innerHTML = "";
  const p = document.createElement("span");
  p.textContent = text;
  const b = document.createElement("button");
  b.className = "btn sm";
  b.textContent = "Tentar de novo";
  b.onclick = retry;
  loading.append(p, b);
  loading.hidden = false;
}

// ---------- Câmera ----------
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("Seu navegador não permite acesso à câmera.");
    return;
  }
  startBtn.disabled = true;
  try {
    const constraints = {
      audio: false,
      video: state.deviceId
        ? { deviceId: { exact: state.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stopStream();
    state.stream = stream;
    video.srcObject = stream;
    await video.play();
    resizeCanvases();

    state.running = true;
    state.lastVideoTime = -1;
    emptyState.hidden = true;
    hud.hidden = false;
    document.body.classList.add("cam-on");
    // Câmera traseira não deve ficar espelhada
    const facing = stream.getVideoTracks()[0]?.getSettings().facingMode;
    if (facing === "environment") setMirror(false);
    else if (facing === "user") setMirror(true);
    camBtn.disabled = false;
    shotBtn.disabled = false;
    camBtn.querySelector("span").textContent = "Desligar";
    await listCameras();
    if (!state.looping) { state.looping = true; requestAnimationFrame(loop); }
  } catch (err) {
    console.error(err);
    if (state.deviceId && (err.name === "OverconstrainedError" || err.name === "NotFoundError")) {
      state.deviceId = null; // câmera salva não existe mais: tenta a padrão
      startBtn.disabled = false;
      return startCamera();
    }
    const msg = err.name === "NotAllowedError"
      ? "Permissão da câmera negada. Libere o acesso no navegador."
      : err.name === "NotFoundError" ? "Nenhuma câmera encontrada." : "Não foi possível abrir a câmera.";
    toast(msg);
  } finally {
    startBtn.disabled = false;
  }
}

function stopStream() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
}

function stopCamera() {
  state.running = false;
  stopStream();
  video.srcObject = null;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  emptyState.hidden = false;
  hud.hidden = true;
  document.body.classList.remove("cam-on");
  shotBtn.disabled = true;
  camBtn.querySelector("span").textContent = "Ligar";
  state.mode?.reset?.();
}

async function listCameras() {
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    const current = state.stream?.getVideoTracks()[0]?.getSettings().deviceId;
    cameraSelect.replaceChildren(
      ...devices.map((d, i) => {
        const o = document.createElement("option");
        o.value = d.deviceId;
        o.textContent = d.label || `Câmera ${i + 1}`;
        if (d.deviceId === current) o.selected = true;
        return o;
      })
    );
    cameraSelect.disabled = devices.length < 2;
    flipBtn.hidden = devices.length < 2;
    state.devices = devices;
  } catch {}
}

function resizeCanvases() {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  if (overlay.width !== w || overlay.height !== h) {
    overlay.width = drawCanvas.width = w;
    overlay.height = drawCanvas.height = h;
  }
  stage.style.aspectRatio = `${w} / ${h}`;
}

video.addEventListener("resize", resizeCanvases);

// ---------- Loop principal ----------
function loop(now) {
  if (!state.running) { state.looping = false; return; }

  if (state.ready && video.readyState >= 2 && video.currentTime !== state.lastVideoTime) {
    state.lastVideoTime = video.currentTime;
    const t0 = performance.now();
    const ui = now - state.lastUi > 90; // atualiza o painel ~11x por segundo
    if (ui) state.lastUi = now;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    try {
      state.mode.frame({ video, ts: t0, ctx, canvas: overlay, drawCtx, drawCanvas, mirrored: state.mirrored, ui });
    } catch (err) {
      console.error(err);
    }
    const dt = performance.now() - t0;
    state.ms = state.ms ? state.ms * 0.9 + dt * 0.1 : dt;
    if (state.lastFrameAt) {
      const inst = 1000 / (now - state.lastFrameAt);
      state.fps = state.fps ? state.fps * 0.9 + inst * 0.1 : inst;
    }
    state.lastFrameAt = now;
    if (ui) {
      fpsPill.textContent = `${Math.round(state.fps)} fps`;
      msPill.textContent = `${state.ms.toFixed(0)} ms`;
    }
  }
  requestAnimationFrame(loop);
}

// ---------- Foto ----------
function screenshot() {
  if (!state.running) return;
  const w = video.videoWidth, h = video.videoHeight;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (state.mirrored) { g.translate(w, 0); g.scale(-1, 1); }
  g.drawImage(video, 0, 0, w, h);
  if (overlayToggle.checked) g.drawImage(overlay, 0, 0);
  if (state.mode?.usesDrawing) g.drawImage(drawCanvas, 0, 0);
  // Obs.: rótulos já foram desenhados "des-espelhados", então ficam legíveis na foto.
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.download = `frepof-${state.mode.id}-${stamp}.png`;
  c.toBlob(async (blob) => {
    // No celular, abre o menu de compartilhar (salvar na galeria, WhatsApp…)
    const file = new File([blob], a.download, { type: "image/png" });
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  stage.classList.remove("flash");
  void stage.offsetWidth;
  stage.classList.add("flash");
  if (!matchMedia("(pointer: coarse)").matches) toast("Foto salva");
}

// ---------- Controles ----------
startBtn.addEventListener("click", startCamera);
camBtn.addEventListener("click", () => (state.running ? stopCamera() : startCamera()));
shotBtn.addEventListener("click", screenshot);

flipBtn.addEventListener("click", () => {
  const list = state.devices || [];
  if (list.length < 2) return;
  const current = state.stream?.getVideoTracks()[0]?.getSettings().deviceId;
  const i = list.findIndex((d) => d.deviceId === current);
  state.deviceId = list[(i + 1) % list.length].deviceId;
  store.set("camera", state.deviceId);
  startCamera();
});

// Gaveta do painel no celular
function setSheet(open) {
  panel.classList.toggle("expanded", open);
  sheetHandle.setAttribute("aria-expanded", String(open));
  if (!open) panel.scrollTop = 0;
}
sheetHandle.addEventListener("click", () => setSheet(!panel.classList.contains("expanded")));
$("panelHead").addEventListener("click", () => setSheet(!panel.classList.contains("expanded")));
// Arrastar a alça para cima/baixo
let touchY = null;
sheetHandle.addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
sheetHandle.addEventListener("touchend", (e) => {
  if (touchY == null) return;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dy) > 30) { e.preventDefault(); setSheet(dy < 0); }
  touchY = null;
});

cameraSelect.addEventListener("change", () => {
  state.deviceId = cameraSelect.value;
  store.set("camera", state.deviceId);
  startCamera();
});

function setMirror(on) {
  state.mirrored = on;
  mirrorToggle.checked = on;
  stage.classList.toggle("mirrored", on);
  store.set("mirror", on ? "1" : "0");
}
mirrorToggle.addEventListener("change", () => setMirror(mirrorToggle.checked));

overlayToggle.addEventListener("change", () => {
  stage.classList.toggle("no-overlay", !overlayToggle.checked);
});

$("themeBtn").addEventListener("click", () => {
  const root = document.documentElement;
  const isDark = root.dataset.theme
    ? root.dataset.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = isDark ? "light" : "dark";
  store.set("theme", root.dataset.theme);
});

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= MODES.length) selectMode(MODES[n - 1].id);
  else if (e.code === "Space") { e.preventDefault(); state.running ? stopCamera() : startCamera(); }
  else if (e.key.toLowerCase() === "s") screenshot();
  else if (e.key.toLowerCase() === "m") setMirror(!state.mirrored);
});

window.addEventListener("hashchange", () => selectMode(location.hash.slice(1)));

// API exposta aos modos
const api = {
  toast,
  clearDrawing() { drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height); },
  get mirrored() { return state.mirrored; },
};

// Acesso para depuração pelo console do navegador (ex.: frepof.state)
window.frepof = { state, selectMode, MODES };

// ---------- Início ----------
state.deviceId = store.get("camera");
setMirror(store.get("mirror") !== "0");
selectMode(location.hash.slice(1) || store.get("mode") || "maos");
