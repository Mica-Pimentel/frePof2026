// Carregamento da biblioteca MediaPipe Tasks Vision e dos modelos.
// Para atualizar a biblioteca no futuro, basta trocar a versão abaixo
// (e a do import logo em seguida).
import * as mp from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";

export const MP_VERSION = "1.0.1";
export { mp };

const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const M = "https://storage.googleapis.com/mediapipe-models";

export const MODELS = {
  gesture: `${M}/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task`,
  face: `${M}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
  pose: `${M}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  objects: `${M}/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
  selfie: `${M}/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite`,
};

let filesetPromise = null;
function getFileset() {
  filesetPromise ??= mp.FilesetResolver.forVisionTasks(WASM_URL);
  return filesetPromise;
}

/**
 * Cria uma tarefa do MediaPipe em modo VIDEO.
 * Tenta usar a GPU e, se não der, cai para a CPU automaticamente.
 */
export async function createTask(TaskClass, modelAssetPath, options = {}) {
  const fileset = await getFileset();
  let lastError;
  for (const delegate of ["GPU", "CPU"]) {
    try {
      return await TaskClass.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: "VIDEO",
        ...options,
      });
    } catch (err) {
      lastError = err;
      console.warn(`[frePof] Falha ao criar tarefa com ${delegate}.`, err);
    }
  }
  throw lastError;
}
