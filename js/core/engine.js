// "Motor" de análise: roda os modelos num Worker (página fluida) e,
// se o navegador não suportar, roda na própria página como plano B.
import { mp } from "./vision.js?v=9";
import { createEntry, runEntry } from "./runner.js?v=9";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

/** Plano B: tudo na página principal. */
class MainEngine {
  kind = "página";
  entries = new Map();
  fileset = null;
  async load(mode, desc) {
    let e = this.entries.get(mode);
    if (!e) {
      this.fileset ??= mp.FilesetResolver.forVisionTasks(WASM_URL);
      e = await createEntry(mp, await this.fileset, desc);
      this.entries.set(mode, e);
    } else if (desc.options) {
      await e.task.setOptions(desc.options);
    }
    return { delegate: e.delegate };
  }
  async infer(mode, video) {
    return runEntry(this.entries.get(mode), video).out;
  }
  async setOptions(mode, options) {
    await this.entries.get(mode)?.task.setOptions(options);
  }
}

/** Principal: Worker em paralelo. */
class WorkerEngine {
  kind = "worker";
  constructor(worker) {
    this.worker = worker;
    this.seq = 0;
    this.pending = new Map();
    worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      data.ok ? p.resolve(data) : p.reject(new Error(data.error));
    };
  }
  call(msg, transfer = []) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id }, transfer);
    });
  }
  async load(mode, desc) {
    const r = await this.call({ type: "load", mode, desc });
    return { delegate: r.delegate };
  }
  async infer(mode, video) {
    const bitmap = await createImageBitmap(video);
    const r = await this.call({ type: "frame", mode, bitmap }, [bitmap]);
    return r.result;
  }
  async setOptions(mode, options) {
    await this.call({ type: "setOptions", mode, options });
  }
}

/** Tenta iniciar o Worker; se não conseguir em 15 s, usa o plano B. */
function startWorker() {
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL("./worker.js?v=9", import.meta.url), { type: "module" });
    } catch {
      return resolve(null);
    }
    const timer = setTimeout(() => { worker.terminate(); resolve(null); }, 15000);
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); resolve(null); };
    worker.onmessage = ({ data }) => {
      if (data?.type === "hello") { clearTimeout(timer); resolve(worker); }
    };
  });
}

let enginePromise = null;
export function getEngine() {
  enginePromise ??= (async () => {
    const canWorker = typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap !== "undefined";
    const w = canWorker ? await startWorker() : null;
    if (w) return new WorkerEngine(w);
    console.warn("[frePof] Worker indisponível — rodando na página principal.");
    return new MainEngine();
  })();
  return enginePromise;
}

/** Se o Worker falhar ao carregar um modelo (ex.: navegador sem GPU em Worker), troca para o plano B. */
export async function fallbackToMain() {
  const e = await getEngine();
  if (e.kind === "worker") {
    e.worker.terminate();
    enginePromise = Promise.resolve(new MainEngine());
  }
  return enginePromise;
}
