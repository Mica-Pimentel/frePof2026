import { mp, createTask, MODELS } from "../core/vision.js";
import { h, section, stat, slider, setText } from "../core/ui.js";
import { drawLabel, strokeBox, scaleOf, PALETTE } from "../core/draw.js";

// Tradução das 80 classes do conjunto COCO
const PT = {
  person: "pessoa", bicycle: "bicicleta", car: "carro", motorcycle: "moto", airplane: "avião", bus: "ônibus",
  train: "trem", truck: "caminhão", boat: "barco", "traffic light": "semáforo", "fire hydrant": "hidrante",
  "stop sign": "placa de pare", "parking meter": "parquímetro", bench: "banco", bird: "pássaro", cat: "gato",
  dog: "cachorro", horse: "cavalo", sheep: "ovelha", cow: "vaca", elephant: "elefante", bear: "urso",
  zebra: "zebra", giraffe: "girafa", backpack: "mochila", umbrella: "guarda-chuva", handbag: "bolsa",
  tie: "gravata", suitcase: "mala", frisbee: "frisbee", skis: "esqui", snowboard: "snowboard",
  "sports ball": "bola", kite: "pipa", "baseball bat": "taco de beisebol", "baseball glove": "luva de beisebol",
  skateboard: "skate", surfboard: "prancha de surfe", "tennis racket": "raquete", bottle: "garrafa",
  "wine glass": "taça", cup: "copo", fork: "garfo", knife: "faca", spoon: "colher", bowl: "tigela",
  banana: "banana", apple: "maçã", sandwich: "sanduíche", orange: "laranja", broccoli: "brócolis",
  carrot: "cenoura", "hot dog": "cachorro-quente", pizza: "pizza", donut: "rosquinha", cake: "bolo",
  chair: "cadeira", couch: "sofá", "potted plant": "planta", bed: "cama", "dining table": "mesa",
  toilet: "vaso sanitário", tv: "TV", laptop: "notebook", mouse: "mouse", remote: "controle remoto",
  keyboard: "teclado", "cell phone": "celular", microwave: "micro-ondas", oven: "forno", toaster: "torradeira",
  sink: "pia", refrigerator: "geladeira", book: "livro", clock: "relógio", vase: "vaso", scissors: "tesoura",
  "teddy bear": "ursinho de pelúcia", "hair drier": "secador", toothbrush: "escova de dentes",
};
const pt = (name) => PT[name] || name;

export default {
  id: "objetos",
  label: "Objetos",
  title: "Detecção de objetos",
  hint: "Identifica e conta 80 tipos de objetos do dia a dia: pessoas, celular, copo, livro…",
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="8" y="8" width="8" height="8" rx="1.5"/></svg>`,

  task: null,
  threshold: 0.45,

  async load() {
    this.task = await createTask(mp.ObjectDetector, MODELS.objects, {
      scoreThreshold: this.threshold,
      maxResults: 12,
    });
  },

  dispose() {
    this.task?.close();
    this.task = null;
  },

  mount(el) {
    this.sTotal = stat("objetos na cena", { big: true });
    this.list = h("div", { class: "list" });
    this.empty = h("p", { class: "empty-note" }, "Nada detectado ainda.");

    el.append(
      section(null, h("div", { class: "stats" }, this.sTotal.el)),
      section("O que está na cena", this.empty, this.list),
      section("Ajustes",
        slider("Confiança mínima", { min: 0.2, max: 0.9, step: 0.05, value: this.threshold, format: (v) => `${Math.round(v * 100)}%` }, (v) => {
          this.threshold = v;
          this.task?.setOptions({ scoreThreshold: v });
        })
      )
    );
  },

  frame({ video, ts, ctx, canvas, mirrored, ui }) {
    const r = this.task.detectForVideo(video, ts);
    const s = scaleOf(canvas);
    const counts = new Map();

    for (const d of r.detections) {
      const c = d.categories[0];
      if (!c) continue;
      const bb = d.boundingBox;
      const color = PALETTE[c.index % PALETTE.length];
      const name = pt(c.categoryName);
      counts.set(name, (counts.get(name) || 0) + 1);

      strokeBox(ctx, bb.originX, bb.originY, bb.width, bb.height, { color, width: 2.5 * s, radius: 8 * s });
      const lx = mirrored ? bb.originX + bb.width : bb.originX;
      drawLabel(ctx, `${name} ${Math.round(c.score * 100)}%`, lx, bb.originY - 4 * s, { mirrored, size: 13 * s, bg: color });
    }

    if (!ui) return;
    this.sTotal.set(r.detections.length);
    this.empty.hidden = counts.size > 0;
    const key = [...counts].map((x) => x.join(":")).join("|");
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.list.replaceChildren(
        ...[...counts].sort((a, b) => b[1] - a[1]).map(([name, n]) =>
          h("div", { class: "list-item" }, h("span", {}, name[0].toUpperCase() + name.slice(1)), h("span", { class: "count-badge" }, n))
        )
      );
    }
  },
};
