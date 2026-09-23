import { mp, createTask, MODELS } from "../core/vision.js?v=7";
import { h, section, bar, stat, segmented, setText } from "../core/ui.js?v=7";
import { drawLabel, scaleOf, INK, INK_SOFT, ACCENT } from "../core/draw.js?v=7";

const FL = () => mp.FaceLandmarker;

function expressao(b) {
  const avg = (a, c) => ((b[a] ?? 0) + (b[c] ?? 0)) / 2;
  const blinkL = b.eyeBlinkLeft ?? 0, blinkR = b.eyeBlinkRight ?? 0;
  const smile = avg("mouthSmileLeft", "mouthSmileRight");
  const frown = avg("mouthFrownLeft", "mouthFrownRight");
  const browDown = avg("browDownLeft", "browDownRight");
  const browUp = b.browInnerUp ?? 0;
  const jaw = b.jawOpen ?? 0;
  const pucker = b.mouthPucker ?? 0;

  if (Math.abs(blinkL - blinkR) > 0.35 && Math.max(blinkL, blinkR) > 0.5) return ["Piscadinha", "😉"];
  if (blinkL > 0.5 && blinkR > 0.5) return ["Olhos fechados", "😌"];
  if (smile > 0.5) return jaw > 0.35 ? ["Rindo", "😄"] : ["Feliz", "🙂"];
  if (jaw > 0.45 && browUp > 0.25) return ["Surpreso", "😮"];
  if (jaw > 0.5) return ["Boca aberta", "😯"];
  if (browDown > 0.4) return ["Bravo", "😠"];
  if (frown > 0.3 || (browUp > 0.45 && smile < 0.1)) return ["Triste", "🙁"];
  if (pucker > 0.6) return ["Beijinho", "😗"];
  return ["Neutro", "😐"];
}

export default {
  id: "rosto",
  label: "Rosto",
  title: "Expressões do rosto",
  hint: "Detecta expressões, conta piscadas e mostra para onde você está olhando.",
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.5h.01M15 9.5h.01"/></svg>`,

  task: null,
  du: null,
  style: "malha",
  blinks: 0,
  eyesClosed: false,
  baseline: null,
  calib: [],

  async load() {
    this.task = await createTask(FL(), MODELS.face, {
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
  },

  dispose() {
    this.task?.close();
    this.task = null;
    this.du = null;
  },

  reset() {
    this.eyesClosed = false;
  },

  mount(el) {
    this.emoji = h("div", { class: "hero-emoji" }, "😐");
    this.expr = h("div", { class: "hero-main" }, "Procurando rosto…");
    this.dir = h("div", { class: "hero-sub" }, "—");
    this.sBlinks = stat("piscadas", { value: String(this.blinks) });
    this.sSmile = stat("sorriso", { value: "0%" });
    this.sMouth = stat("boca aberta", { value: "0%" });
    this.sBrow = stat("sobrancelhas", { value: "0%" });
    this.bars = Array.from({ length: 7 }, () => bar("—", { mono: true }));

    el.append(
      section(null, h("div", { class: "hero" }, this.emoji, h("div", {}, this.expr, this.dir))),
      section(null,
        h("div", { class: "stats" }, this.sBlinks.el, this.sSmile.el, this.sMouth.el, this.sBrow.el),
        h("div", { class: "row" },
          h("button", { class: "btn sm", type: "button", onClick: () => { this.blinks = 0; this.sBlinks.set(0); } }, "Zerar piscadas"),
          h("button", { class: "btn sm", type: "button", onClick: () => { this.baseline = null; this.calib = []; } }, "Recalibrar olhar")
        )
      ),
      section("Desenho", segmented([["malha", "Malha"], ["contornos", "Contornos"], ["pontos", "Íris"]], this.style, (v) => (this.style = v))),
      section("Músculos mais ativos", h("div", { class: "bars" }, this.bars.map((b) => b.el)))
    );
  },

  frame({ video, ts, ctx, canvas, mirrored, ui }) {
    const r = this.task.detectForVideo(video, ts);
    const W = canvas.width, H = canvas.height, s = scaleOf(canvas);
    this.du ??= new mp.DrawingUtils(ctx);
    const F = FL();

    const lm = r.faceLandmarks?.[0];
    if (!lm) {
      if (ui) {
        setText(this.expr, "Procurando rosto…");
        setText(this.dir, "Olhe para a câmera");
        setText(this.emoji, "👀");
      }
      return;
    }

    // ---- Desenho
    if (this.style === "malha") {
      this.du.drawConnectors(lm, F.FACE_LANDMARKS_TESSELATION, { color: INK_SOFT, lineWidth: 0.6 * s });
    }
    if (this.style !== "pontos") {
      for (const set of [F.FACE_LANDMARKS_FACE_OVAL, F.FACE_LANDMARKS_LIPS, F.FACE_LANDMARKS_LEFT_EYE, F.FACE_LANDMARKS_RIGHT_EYE, F.FACE_LANDMARKS_LEFT_EYEBROW, F.FACE_LANDMARKS_RIGHT_EYEBROW]) {
        this.du.drawConnectors(lm, set, { color: INK, lineWidth: 1.5 * s });
      }
    }
    this.du.drawConnectors(lm, F.FACE_LANDMARKS_LEFT_IRIS, { color: ACCENT, lineWidth: 2 * s });
    this.du.drawConnectors(lm, F.FACE_LANDMARKS_RIGHT_IRIS, { color: ACCENT, lineWidth: 2 * s });

    // ---- Blendshapes
    const cats = r.faceBlendshapes?.[0]?.categories || [];
    const b = {};
    for (const c of cats) b[c.categoryName] = c.score;
    const [nome, emoji] = expressao(b);

    // Piscadas (com histerese para não contar em dobro)
    const blink = ((b.eyeBlinkLeft ?? 0) + (b.eyeBlinkRight ?? 0)) / 2;
    if (!this.eyesClosed && blink > 0.55) this.eyesClosed = true;
    else if (this.eyesClosed && blink < 0.3) { this.eyesClosed = false; this.blinks++; }

    // Direção do olhar/cabeça (posição do nariz entre bochechas e testa/queixo)
    const nose = lm[1], l = lm[234], rr = lm[454], top = lm[10], chin = lm[152];
    const hx = (nose.x - l.x) / (rr.x - l.x || 1e-6);
    const vy = (nose.y - top.y) / (chin.y - top.y || 1e-6);
    if (!this.baseline) {
      this.calib.push([hx, vy]);
      if (this.calib.length >= 15) {
        const n = this.calib.length;
        this.baseline = this.calib.reduce((a, c) => [a[0] + c[0] / n, a[1] + c[1] / n], [0, 0]);
      }
    }
    let dir = "Calibrando…";
    if (this.baseline) {
      const dx = hx - this.baseline[0], dy = vy - this.baseline[1];
      const parts = [];
      if (dy < -0.07) parts.push("cima");
      else if (dy > 0.07) parts.push("baixo");
      if (dx > 0.12) parts.push("esquerda");
      else if (dx < -0.12) parts.push("direita");
      dir = parts.length ? `Olhando para ${parts.join(" e ")}` : "Olhando para frente";
    }

    // Rótulo acima da cabeça
    drawLabel(ctx, `${emoji} ${nome}`, top.x * W, top.y * H - 14 * s, { mirrored, size: 14 * s, align: "center" });

    if (!ui) return;
    setText(this.emoji, emoji);
    setText(this.expr, nome);
    setText(this.dir, dir);
    this.sBlinks.set(this.blinks);
    const pct = (v) => `${Math.round(v * 100)}%`;
    this.sSmile.set(pct(((b.mouthSmileLeft ?? 0) + (b.mouthSmileRight ?? 0)) / 2));
    this.sMouth.set(pct(b.jawOpen ?? 0));
    this.sBrow.set(pct(Math.max(b.browInnerUp ?? 0, ((b.browOuterUpLeft ?? 0) + (b.browOuterUpRight ?? 0)) / 2)));

    const top7 = cats.filter((c) => c.categoryName !== "_neutral").sort((a, c) => c.score - a.score).slice(0, 7);
    this.bars.forEach((bb, i) => bb.set(top7[i]?.score ?? 0, top7[i]?.categoryName ?? "—"));
  },
};
