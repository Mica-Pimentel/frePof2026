import { mp, createTask, MODELS } from "../core/vision.js?v=7";
import { h, section, stat, segmented, setText } from "../core/ui.js?v=7";
import { drawLabel, scaleOf, angle, INK, ACCENT } from "../core/draw.js?v=7";

// Índices dos pontos do corpo no modelo de pose
const P = {
  nose: 0,
  ombro: [11, 12], cotovelo: [13, 14], pulso: [15, 16],
  quadril: [23, 24], joelho: [25, 26], tornozelo: [27, 28],
};

const EXERCICIOS = {
  agachamento: {
    nome: "Agachamento",
    dica: "Fique de lado para a câmera, com o corpo inteiro visível.",
    fases: ["Em pé", "Agachado"],
  },
  rosca: {
    nome: "Rosca bíceps",
    dica: "Mostre o braço inteiro (ombro, cotovelo e pulso).",
    fases: ["Braço esticado", "Braço dobrado"],
  },
  polichinelo: {
    nome: "Polichinelo",
    dica: "Fique de frente, com os braços visíveis. Conta ao subir e descer os braços.",
    fases: ["Braços embaixo", "Braços em cima"],
  },
};

export default {
  id: "corpo",
  label: "Corpo",
  title: "Pose e exercícios",
  hint: "Rastreia o esqueleto do corpo, mede ângulos e conta repetições.",
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="2"/><path d="M5 9l7 1.5L19 9M12 10.5V15M8.5 21l3.5-6 3.5 6"/></svg>`,

  task: null,
  du: null,
  ex: "agachamento",
  reps: 0,
  phase: 0, // 0 = posição inicial, 1 = posição final
  hist: [],

  async load() {
    this.task = await createTask(mp.PoseLandmarker, MODELS.pose, { numPoses: 1 });
  },

  dispose() {
    this.task?.close();
    this.task = null;
    this.du = null;
  },

  reset() {
    this.phase = 0;
  },

  mount(el) {
    this.sReps = stat("repetições", { big: true, value: String(this.reps) });
    this.sKnee = stat("ângulo do joelho", { value: "—" });
    this.sElbow = stat("ângulo do cotovelo", { value: "—" });
    this.phaseEl = h("span", { class: "phase" }, "—");
    this.status = h("span", { class: "hero-sub" }, "");
    this.tip = h("div", { class: "hint-box" }, EXERCICIOS[this.ex].dica);

    el.append(
      section("Exercício",
        segmented(Object.entries(EXERCICIOS).map(([k, v]) => [k, v.nome]), this.ex, (v) => {
          this.ex = v;
          this.reps = 0;
          this.phase = 0;
          this.sReps.set(0);
          this.tip.textContent = EXERCICIOS[v].dica;
        }),
        this.tip
      ),
      section(null,
        h("div", { class: "stats" }, this.sReps.el, this.sKnee.el, this.sElbow.el),
        h("div", { class: "row between" },
          h("div", { class: "row" }, this.phaseEl, this.status),
          h("button", { class: "btn sm", type: "button", onClick: () => { this.reps = 0; this.phase = 0; this.sReps.set(0); } }, "Zerar")
        )
      )
    );
  },

  frame({ video, ts, ctx, canvas, mirrored, ui }) {
    const r = this.task.detectForVideo(video, ts);
    const W = canvas.width, H = canvas.height, s = scaleOf(canvas);
    this.du ??= new mp.DrawingUtils(ctx);

    const lm = r.landmarks?.[0];
    if (!lm) {
      if (ui) { setText(this.status, "Ninguém à vista"); this.phaseEl.className = "phase"; setText(this.phaseEl, "—"); }
      return;
    }

    // Esqueleto (sem os pontos do rosto, para ficar mais limpo)
    const body = POSE_CONNECTIONS_BODY();
    this.du.drawConnectors(lm, body, { color: INK, lineWidth: 3 * s });
    this.du.drawLandmarks(lm.slice(11), { color: ACCENT, fillColor: ACCENT, lineWidth: 1, radius: 4 * s });

    const px = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility ?? 1 });

    // Escolhe o lado do corpo mais visível
    const side = (key) => {
      const [a, b] = P[key];
      return (lm[a].visibility ?? 1) >= (lm[b].visibility ?? 1) ? 0 : 1;
    };
    const sd = side("joelho");
    const knee = { a: px(P.quadril[sd]), b: px(P.joelho[sd]), c: px(P.tornozelo[sd]) };
    const sa = side("cotovelo");
    const elbow = { a: px(P.ombro[sa]), b: px(P.cotovelo[sa]), c: px(P.pulso[sa]) };
    const visible = (j) => j.a.v > 0.5 && j.b.v > 0.5 && j.c.v > 0.5;

    const kneeAng = visible(knee) ? angle(knee.a, knee.b, knee.c) : null;
    const elbowAng = visible(elbow) ? angle(elbow.a, elbow.b, elbow.c) : null;

    const tag = (j, ang) => {
      if (ang == null) return;
      const off = 14 * s;
      drawLabel(ctx, `${Math.round(ang)}°`, j.b.x + (mirrored ? -off : off), j.b.y, { mirrored, size: 13 * s, bg: "rgba(91,124,255,.9)" });
    };
    tag(knee, kneeAng);
    tag(elbow, elbowAng);

    // ---- Contador de repetições
    let ok = true;
    if (this.ex === "agachamento") {
      if (kneeAng == null) ok = false;
      else if (this.phase === 0 && kneeAng < 100) this.phase = 1;
      else if (this.phase === 1 && kneeAng > 160) { this.phase = 0; this.reps++; }
    } else if (this.ex === "rosca") {
      if (elbowAng == null) ok = false;
      else if (this.phase === 0 && elbowAng < 50) { this.phase = 1; this.reps++; }
      else if (this.phase === 1 && elbowAng > 150) this.phase = 0;
    } else if (this.ex === "polichinelo") {
      const nose = px(P.nose), wl = px(P.pulso[0]), wr = px(P.pulso[1]);
      const sl = px(P.ombro[0]), sr = px(P.ombro[1]);
      if (wl.v < 0.4 || wr.v < 0.4 || sl.v < 0.5 || sr.v < 0.5) ok = false;
      else {
        const up = wl.y < nose.y && wr.y < nose.y;
        const down = wl.y > sl.y && wr.y > sr.y;
        if (this.phase === 0 && up) this.phase = 1;
        else if (this.phase === 1 && down) { this.phase = 0; this.reps++; }
      }
    }

    if (!ui) return;
    this.sReps.set(this.reps);
    this.sKnee.set(kneeAng == null ? "—" : `${Math.round(kneeAng)}°`);
    this.sElbow.set(elbowAng == null ? "—" : `${Math.round(elbowAng)}°`);
    setText(this.phaseEl, EXERCICIOS[this.ex].fases[this.phase]);
    this.phaseEl.className = "phase" + (this.phase ? " on" : "");
    setText(this.status, ok ? "" : "Afaste-se um pouco");
  },
};

// Conexões do corpo sem as do rosto (índices < 11)
let _body = null;
function POSE_CONNECTIONS_BODY() {
  _body ??= mp.PoseLandmarker.POSE_CONNECTIONS.filter((c) => c.start >= 11 && c.end >= 11);
  return _body;
}
