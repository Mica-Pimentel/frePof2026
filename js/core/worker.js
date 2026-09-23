// Worker: roda os modelos do MediaPipe fora da página principal,
// para que a interface continue fluida enquanto as imagens são analisadas.
import * as mp from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";
import { createEntry, runEntry } from "./runner.js?v=9";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
let filesetPromise = null;
const getFileset = () => (filesetPromise ??= mp.FilesetResolver.forVisionTasks(WASM_URL, true));

// O MediaPipe "consome" o carregador do WebAssembly a cada modelo criado.
// Num Worker de módulo o arquivo não é executado de novo, então guardamos
// o carregador e o devolvemos antes de criar cada modelo.
let loaderFactory = null;
async function restoreFactory() {
  const fs = await getFileset();
  if (!loaderFactory) {
    const m = await import(fs.wasmLoaderPath);
    loaderFactory = m.default || self.ModuleFactory;
  }
  self.ModuleFactory = loaderFactory;
}

const entries = new Map(); // modo -> tarefa carregada (fica em memória para trocar rápido)

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === "load") {
      let e = entries.get(data.mode);
      if (!e) {
        e = await createEntry(mp, await getFileset(), data.desc, restoreFactory);
        entries.set(data.mode, e);
      } else if (data.desc.options) {
        await e.task.setOptions(data.desc.options);
      }
      self.postMessage({ id, ok: true, delegate: e.delegate });
    } else if (type === "frame") {
      const e = entries.get(data.mode);
      const { out, transfer } = runEntry(e, data.bitmap);
      data.bitmap.close();
      self.postMessage({ id, ok: true, result: out }, transfer);
    } else if (type === "setOptions") {
      await entries.get(data.mode)?.task.setOptions(data.options);
      self.postMessage({ id, ok: true });
    }
  } catch (err) {
    data.bitmap?.close?.();
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};

self.postMessage({ type: "hello" });
