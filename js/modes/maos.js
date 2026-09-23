import { mp, MODELS } from "../core/vision.js?v=9";
import { h, section, bar, stat, toggle, slider, segmented, setText } from "../core/ui.js?v=9";
import { drawLabel, scaleOf, dist, angle, INK, ACCENT, PALETTE } from "../core/draw.js?v=9";

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
  penMode: "indicador", // "indicador" ou "pinca"
  smooth: 0.6,          // 0 = sem suavização, 0.9 = muito suave
  penOn: false,
  onFrames: 0,
  offFrames: 0,
  lostAt: 0,
  cursor: null,

  // Qual modelo usar (carregado pelo motor, no Worker)
  get desc() {
    return {
      cls: "GestureRecognizer", method: "recognizeForVideo", model: MODELS.gesture,
      options: { numHands: this.drawOn ? 1 : 2, minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5 },
    };
  },

  dispose() {
    this.du = null;
    this.last = null;
  },

  reset() {
    this.last = null;
    this.penOn = false;
    this.cursor = null;
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

    const penHint = h("p", { class: "hero-sub" });
    const syncHint = () => {
      penHint.textContent = this.penMode === "pinca"
        ? "Encoste o polegar no indicador para desenhar. Afaste para parar."
        : "Levante só o indicador para desenhar. Dobre o dedo ou feche a mão para parar.";
    };
    syncHint();

    const drawControls = h("div", { class: "section", style: { gap: "12px" } },
      segmented([["indicador", "☝️ Indicador"], ["pinca", "🤏 Pinça"]], this.penMode, (v) => {
        this.penMode = v;
        this.penOn = false;
        this.last = null;
        syncHint();
      }),
      penHint,
      swatches,
      slider("Espessura", { min: 2, max: 20, value: this.size, format: (v) => `${v}px` }, (v) => (this.size = v)),
      slider("Suavização do traço", { min: 0, max: 0.9, step: 0.05, value: this.smooth, format: (v) => `${Math.round(v * 100)}%` }, (v) => (this.smooth = v)),
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
        toggle("Ativar desenho", this.drawOn, (on) => {
          this.drawOn = on;
          app.setOptions({ numHands: on ? 1 : 2 }); // desenhando, uma mão basta (mais rápido)
          this.last = null;
          drawControls.hidden = !on;
        }),
        drawControls
      )
    );
  },

  frame({ results: r, now: ts, ctx, canvas, drawCtx, mirrored, ui }) {
    const W = canvas.width, H = canvas.height, s = scaleOf(canvas);
    this.du ??= new mp.DrawingUtils(ctx);

    const hands = r.landmarks.map((lm, i) => {
      this.du.drawConnectors(lm, mp.GestureRecognizer.HAND_CONNECTIONS, { color: INK, lineWidth: 2 * s });
      this.du.drawLandmarks(lm, { color: ACCENT, fillColor: ACCENT, lineWidth: 1, radius: 3 * s });

      const g = r.gestures[i]?.[0];
      const hd = r.handedness?.[i]?.[0];
      // O modelo já informa o lado correto para a imagem da câmera (frontal ou traseira).
      // O espelhamento da tela é só visual e não afeta essa informação.
      const side = hd?.categoryName === "Right" ? "Direita" : "Esquerda";
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
    this.updatePen(hands, ctx, drawCtx, s, now);

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

  /**
   * Decide se a "caneta" está encostada, com histerese:
   * - para LIGAR o dedo precisa estar claramente na posição por 2 quadros seguidos;
   * - para DESLIGAR precisa estar claramente fora por 4 quadros seguidos;
   * - na zona intermediária, mantém o estado anterior (evita o liga/desliga).
   */
  penSignal(hd) {
    const p = hd.p;
    const palma = dist(p[0], p[9]) || 1;
    if (this.penMode === "pinca") {
      const d = dist(p[4], p[8]) / palma;
      const pos = { x: (p[4].x + p[8].x) / 2, y: (p[4].y + p[8].y) / 2 };
      return { on: d < 0.25, off: d > 0.42, pos };
    }
    const indicador = angle(p[5], p[6], p[8]);  // ~180° = reto
    const medio = angle(p[9], p[10], p[12]);
    const anelar = angle(p[13], p[14], p[16]);
    return {
      on: indicador > 150 && medio < 130 && anelar < 140,
      off: indicador < 120 || medio > 160,
      pos: p[8],
    };
  },

  updatePen(hands, ctx, drawCtx, s, now) {
    // Usa a mão mais próxima do último ponto (para não pular de uma mão para outra)
    let hd = hands[0];
    if (this.cursor && hands.length > 1) {
      hd = hands.reduce((a, b) => (dist(this.penSignal(a).pos, this.cursor) <= dist(this.penSignal(b).pos, this.cursor) ? a : b));
    }

    if (!hd) {
      // Mão sumiu: tolera até 300 ms sem quebrar o traço
      if (this.penOn && !this.lostAt) this.lostAt = now;
      if (this.lostAt && now - this.lostAt > 300) { this.penOn = false; this.last = null; this.cursor = null; }
      return;
    }
    const gap = this.lostAt ? now - this.lostAt : 0;
    this.lostAt = 0;

    const sig = this.penSignal(hd);
    if (!this.penOn) {
      this.onFrames = sig.on ? this.onFrames + 1 : 0;
      if (this.onFrames >= 2) { this.penOn = true; this.offFrames = 0; this.last = null; }
    } else {
      this.offFrames = sig.off ? this.offFrames + 1 : 0;
      if (this.offFrames >= 4) { this.penOn = false; this.onFrames = 0; this.last = null; }
    }

    // Suavização adaptativa: tremidas pequenas são filtradas, movimentos rápidos passam direto
    const raw = sig.pos;
    if (!this.cursor || gap > 300) this.cursor = { ...raw };
    else {
      const v = dist(raw, this.cursor);
      const a = 1 - this.smooth * Math.exp(-v / (25 * s));
      this.cursor = { x: this.cursor.x + (raw.x - this.cursor.x) * a, y: this.cursor.y + (raw.y - this.cursor.y) * a };
    }
    const pt = this.cursor;

    if (this.penOn) {
      if (this.last && dist(this.last, pt) < 0.25 * drawCtx.canvas.width) {
        drawCtx.strokeStyle = this.color;
        drawCtx.lineWidth = this.size * s;
        drawCtx.lineCap = "round";
        drawCtx.lineJoin = "round";
        drawCtx.beginPath();
        drawCtx.moveTo(this.last.x, this.last.y);
        drawCtx.lineTo(pt.x, pt.y);
        drawCtx.stroke();
      }
      this.last = { ...pt };
    }

    // Cursor: cheio = desenhando, vazio = só apontando
    const r = (this.size / 2 + 5) * s;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.lineWidth = 2.5 * s;
    ctx.strokeStyle = this.penOn ? this.color : "rgba(255,255,255,.85)";
    ctx.stroke();
    if (this.penOn) {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(2, (this.size / 2) * s), 0, Math.PI * 2);
      ctx.fill();
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
