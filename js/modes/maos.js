import { mp, createTask, MODELS } from "../core/vision.js";
import { h, section, bar, stat, toggle, slider, setText } from "../core/ui.js";
import { drawLabel, scaleOf, dist, INK, ACCENT, PALETTE } from "../core/draw.js";

const GESTOS = {
  None: ["Sem gesto", "✋"],
  Closed_Fist: ["Punho fechado", "✊"],
  Open_Palm: ["Mão aberta", "🖐️"],
  Pointing_Up: ["Apontando", "☝️"],
  Thumb_Down: ["Joinha pra baixo", "👎"],
  Thumb_Up: ["Joinha", "👍"],
  Victory: ["Paz e amor", "✌️"],
  ILoveYou: ["Te amo", "🤟"],
  // Gestos extras (reconhecidos pela posição dos dedos, ver gestoExtra)
  OK: ["OK", "👌"],
  Rock: ["Rock", "🤘"],
  Hang_Loose: ["Hang loose", "🤙"],
  Arminha: ["Arminha", "👉"],
  Dedo_Meio: ["Dedo do meio", "🖕"],
  Mindinho: ["Mindinho", "🤞"],
  Tres: ["Três", "3️⃣"],
  Quatro: ["Quatro", "4️⃣"],
  Pinca: ["Pinça", "🤏"],
};

/**
 * O modelo do Google só conhece 7 gestos. Quando ele responde "None",
 * tentamos reconhecer outros olhando quais dedos estão esticados.
 * f = [polegar, indicador, médio, anelar, mínimo]
 */
function gestoExtra(f, p) {
  const [t, i, m, a, n] = f;
  const palma = dist(p[0], p[9]) || 1;
  const pontasJuntas = dist(p[4], p[8]) < palma * 0.28;
  if (pontasJuntas && m && a && n) return "OK";
  if (pontasJuntas && !m && !a && !n) return "Pinca";
  if (!i && m && !a && !n) return "Dedo_Meio";
  if (i && !m && !a && n) return "Rock";
  if (t && !i && !m && !a && n) return "Hang_Loose";
  if (t && i && !m && !a && !n) return "Arminha";
  if (!t && !i && !m && !a && n) return "Mindinho";
  if (i && m && a && !n) return "Tres";
  if (!t && i && m && a && n) return "Quatro";
  return "None";
}

/** Quais dedos estão esticados: [polegar, indicador, médio, anelar, mínimo]. */
function fingerStates(p) {
  const w = p[0];
  const ext = (tip, pip) => dist(p[tip], w) > dist(p[pip], w) * 1.08;
  const thumb = dist(p[4], p[17]) > dist(p[5], p[17]) * 1.1 && dist(p[4], p[9]) > dist(p[3], p[9]);
  return [thumb, ext(8, 6), ext(12, 10), ext(16, 14), ext(20, 18)];
}

const FINGER_NAMES = ["Polegar", "Indicador", "Médio", "Anelar", "Mínimo"];

export default {
  id: "maos",
  label: "Mãos",
  title: "Gestos das mãos",
  hint: "Reconhece até duas mãos, 16 gestos (joinha, paz e amor, OK, rock, hang loose…) e quantos dedos estão levantados.",
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-2a2 2 0 0 0-4 0"/></svg>`,
  usesDrawing: true,

  task: null,
  du: null,
  // Desenho no ar
  drawOn: false,
  color: PALETTE[0],
  size: 6,
  last: null,
  palmSince: 0,

  async load() {
    this.task = await createTask(mp.GestureRecognizer, MODELS.gesture, {
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  },

  dispose() {
    this.task?.close();
    this.task = null;
    this.du = null;
    this.last = null;
  },

  reset() {
    this.last = null;
  },

  mount(el, app) {
    this.app = app;
    this.total = stat("dedos levantados", { big: true });

    this.cards = [0, 1].map(() => {
      const emoji = h("div", { class: "hero-emoji" }, "✋");
      const main = h("div", { class: "hero-main" }, "—");
      const sub = h("div", { class: "hero-sub" }, "—");
      const conf = bar("Confiança");
      const fingers = h("div", { class: "hero-sub" }, "");
      const card = h("div", { class: "hand-card" },
        h("div", { class: "hero" }, emoji, h("div", {}, main, sub)),
        conf.el,
        fingers
      );
      card.hidden = true;
      return { card, emoji, main, sub, conf, fingers };
    });
    this.emptyNote = h("p", { class: "empty-note" }, "Mostre a mão para a câmera.");

    // Paleta de cores do desenho
    const swatches = h("div", { class: "swatches" });
    PALETTE.concat("#ffffff").forEach((c) => {
      const b = h("button", { class: "swatch", type: "button", title: c, "aria-pressed": String(c === this.color), style: { background: c } });
      b.addEventListener("click", () => {
        this.color = c;
        swatches.querySelectorAll(".swatch").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      });
      swatches.append(b);
    });

    const drawControls = h("div", { class: "section", style: { gap: "12px" } },
      swatches,
      slider("Espessura", { min: 2, max: 20, value: this.size, format: (v) => `${v}px` }, (v) => (this.size = v)),
      h("div", { class: "row between" },
        h("span", { class: "hero-sub" }, "Mão aberta por 1,5 s também apaga"),
        h("button", { class: "btn sm", type: "button", onClick: () => app.clearDrawing() }, "Limpar")
      )
    );
    drawControls.hidden = !this.drawOn;

    el.append(
      section(null, h("div", { class: "stats" }, this.total.el)),
      section("Mãos detectadas", this.emptyNote, ...this.cards.map((c) => c.card)),
      section("Desenhar no ar",
        h("p", { class: "hero-sub" }, "Levante só o indicador para desenhar. Feche a mão para parar."),
        toggle("Ativar desenho", this.drawOn, (on) => {
          this.drawOn = on;
          this.last = null;
          drawControls.hidden = !on;
        }),
        drawControls
      )
    );
  },

  frame({ video, ts, ctx, canvas, drawCtx, mirrored, ui }) {
    const r = this.task.recognizeForVideo(video, ts);
    const W = canvas.width, H = canvas.height, s = scaleOf(canvas);
    this.du ??= new mp.DrawingUtils(ctx);

    const hands = r.landmarks.map((lm, i) => {
      this.du.drawConnectors(lm, mp.GestureRecognizer.HAND_CONNECTIONS, { color: INK, lineWidth: 2 * s });
      this.du.drawLandmarks(lm, { color: ACCENT, fillColor: ACCENT, lineWidth: 1, radius: 3 * s });

      const g = r.gestures[i]?.[0];
      const hd = r.handedness?.[i]?.[0];
      // O modelo assume imagem espelhada; como a webcam chega "crua", invertemos o lado.
      const side = hd?.categoryName === "Left" ? "Direita" : "Esquerda";
      const p = lm.map((q) => ({ x: q.x * W, y: q.y * H }));
      const f = fingerStates(p);
      let gesture = g?.categoryName || "None";
      let score = g?.score ?? 0;
      if (gesture === "None") {
        gesture = gestoExtra(f, p);
        if (gesture !== "None") score = 0.8; // regra geométrica (confiança aproximada)
      }

      const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
      const lx = mirrored ? Math.max(...xs) : Math.min(...xs);
      drawLabel(ctx, `${side} · ${(GESTOS[gesture] || GESTOS.None)[0]}`, lx, Math.min(...ys) - 10 * s, { mirrored, size: 13 * s });

      return { side, gesture, score, f, n: f.filter(Boolean).length, p };
    });

    if (this.drawOn) this.airDraw(hands, ctx, drawCtx, s, ts);

    if (ui) this.render(hands);
  },

  airDraw(hands, ctx, drawCtx, s, now) {
    // Caneta: indicador esticado e médio/anelar dobrados
    const pen = hands.find((hd) => hd.f[1] && !hd.f[2] && !hd.f[3]);
    if (pen) {
      const tip = pen.p[8];
      const pt = this.last ? { x: this.last.x * 0.45 + tip.x * 0.55, y: this.last.y * 0.45 + tip.y * 0.55 } : tip;
      if (this.last) {
        drawCtx.strokeStyle = this.color;
        drawCtx.lineWidth = this.size * s;
        drawCtx.lineCap = "round";
        drawCtx.lineJoin = "round";
        drawCtx.beginPath();
        drawCtx.moveTo(this.last.x, this.last.y);
        drawCtx.lineTo(pt.x, pt.y);
        drawCtx.stroke();
      }
      this.last = pt;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, (this.size / 2 + 4) * s, 0, Math.PI * 2);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    } else {
      this.last = null;
    }

    // Mão totalmente aberta por 1,5 s apaga o desenho
    const palm = hands.some((hd) => hd.gesture === "Open_Palm");
    if (palm) {
      this.palmSince ||= now;
      const t = Math.max(0, Math.min(1, (now - this.palmSince) / 1500));
      const hd = hands.find((x) => x.gesture === "Open_Palm");
      const c = hd.p[9];
      if (t > 0) ctx.beginPath();
      else return;
      ctx.arc(c.x, c.y, 22 * s, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 4 * s;
      ctx.stroke();
      if (t >= 1) {
        this.app.clearDrawing();
        this.palmSince = now + 800; // pequena pausa antes de poder apagar de novo
      }
    } else {
      this.palmSince = 0;
    }
  },

  render(hands) {
    this.total.set(hands.reduce((a, b) => a + b.n, 0));
    this.emptyNote.hidden = hands.length > 0;
    this.cards.forEach((c, i) => {
      const hd = hands[i];
      c.card.hidden = !hd;
      if (!hd) return;
      const [nome, emoji] = GESTOS[hd.gesture] || GESTOS.None;
      setText(c.emoji, emoji);
      setText(c.main, nome);
      setText(c.sub, `Mão ${hd.side.toLowerCase()}`);
      c.conf.set(hd.gesture === "None" ? 0 : hd.score);
      const up = FINGER_NAMES.filter((_, k) => hd.f[k]);
      setText(c.fingers, `${hd.n} ${hd.n === 1 ? "dedo" : "dedos"}${up.length ? " — " + up.join(", ").toLowerCase() : ""}`);
    });
  },
};
