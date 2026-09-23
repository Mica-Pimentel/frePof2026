// Código compartilhado entre o Worker e o modo "sem Worker":
// cria as tarefas do MediaPipe e converte os resultados em dados simples.

/** Cria a tarefa (GPU, com CPU de reserva) e já faz o "aquecimento". */
export async function createEntry(mp, fileset, desc, beforeCreate) {
  let task, delegate, lastErr;
  for (const d of ["GPU", "CPU"]) {
    try {
      await beforeCreate?.();
      task = await mp[desc.cls].createFromOptions(fileset, {
        baseOptions: { modelAssetPath: desc.model, delegate: d },
        runningMode: "VIDEO",
        ...desc.options,
      });
      delegate = d;
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`[frePof] ${desc.cls} falhou com ${d}`, err);
    }
  }
  if (!task) throw lastErr;
  const entry = { task, delegate, cls: desc.cls, method: desc.method, lastTs: 0 };

  // Aquecimento: a 1ª execução na GPU demora segundos (compila shaders).
  // Fazemos isso agora, durante o "Carregando…", e não no meio do vídeo.
  try {
    const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement("canvas"), { width: 256, height: 256 });
    const g = c.getContext("2d");
    g.fillStyle = "#777";
    g.fillRect(0, 0, 256, 256);
    runEntry(entry, c);
  } catch (err) {
    console.warn("[frePof] aquecimento falhou", err);
  }
  return entry;
}

/** Executa a tarefa numa imagem e devolve só os dados que a página usa. */
export function runEntry(entry, image) {
  // O modo VIDEO exige tempos sempre crescentes
  const ts = Math.max(performance.now(), entry.lastTs + 1);
  entry.lastTs = ts;
  const r = entry.task[entry.method](image, ts);
  const transfer = [];
  let out;
  switch (entry.cls) {
    case "GestureRecognizer":
      out = { landmarks: r.landmarks, gestures: r.gestures, handedness: r.handedness };
      break;
    case "FaceLandmarker":
      out = { faceLandmarks: r.faceLandmarks, faceBlendshapes: r.faceBlendshapes };
      break;
    case "PoseLandmarker":
      out = { landmarks: r.landmarks };
      break;
    case "ObjectDetector":
      out = { detections: r.detections };
      break;
    case "ImageSegmenter": {
      const m = r.confidenceMasks?.[0];
      if (m) {
        const data = m.getAsFloat32Array().slice(); // cópia própria (a máscara é liberada abaixo)
        out = { mask: { width: m.width, height: m.height, data } };
        transfer.push(data.buffer);
      } else out = { mask: null };
      break;
    }
    default:
      out = {};
  }
  r?.close?.();
  // Garante que só vão dados simples (sem métodos) para o postMessage
  if (entry.cls !== "ImageSegmenter") out = JSON.parse(JSON.stringify(out));
  return { out, transfer };
}
