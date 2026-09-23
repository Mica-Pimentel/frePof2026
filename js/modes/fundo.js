import { mp, createTask, MODELS } from "../core/vision.js?v=8";
import { h, section, segmented, slider } from "../core/ui.js?v=8";

const hasFilter = typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;

export default {
  id: "fundo",
  label: "Fundo",
  title: "Efeitos de fundo",
  hint: "Separa você do fundo, como numa videochamada: desfoque, cor, preto e branco ou uma imagem sua.",
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M6.5 21a5.5 5.5 0 0 1 11 0"/></svg>`,

  task: null,
  effect: "blur",
  blur: 14,
  color: "#1f2330",
  image: null,

  async load() {
    this.task = await createTask(mp.ImageSegmenter, MODELS.selfie, {
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  },

  dispose() {
    this.task?.close();
    this.task = null;
  },

  mount(el, app) {
    const colorInput = h("input", { type: "color", class: "color-input", value: this.color, title: "Escolher cor" });
    colorInput.addEventListener("input", () => (this.color = colorInput.value));

    const fileInput = h("input", { type: "file", accept: "image/*", hidden: true });
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => { this.image = img; app.toast("Imagem de fundo aplicada"); };
      img.src = URL.createObjectURL(file);
    });

    const blurField = slider("Intensidade do desfoque", { min: 4, max: 30, value: this.blur, format: (v) => `${v}px` }, (v) => (this.blur = v));
    const colorField = h("div", { class: "row between" }, h("span", {}, "Cor do fundo"), colorInput);
    const imageField = h("div", { class: "row between" },
      h("span", { class: "hero-sub" }, "Use qualquer foto do seu computador."),
      h("button", { class: "btn sm", type: "button", onClick: () => fileInput.click() }, "Escolher imagem"),
      fileInput
    );

    const sync = () => {
      blurField.hidden = this.effect !== "blur";
      colorField.hidden = this.effect !== "cor";
      imageField.hidden = this.effect !== "imagem";
    };
    sync();

    el.append(
      section("Efeito",
        segmented([["blur", "Desfocar"], ["cor", "Cor"], ["pb", "P&B"], ["imagem", "Imagem"]], this.effect, (v) => {
          this.effect = v;
          sync();
          if (v === "imagem" && !this.image) fileInput.click();
        }),
        blurField, colorField, imageField
      ),
      section(null, h("div", { class: "hint-box" }, "Dica: desligue “Mostrar detecção” para comparar com a imagem original."))
    );
  },

  ensureCanvases(mw, mh, W, H) {
    if (!this.maskCanvas || this.maskCanvas.width !== mw || this.maskCanvas.height !== mh) {
      this.maskCanvas = document.createElement("canvas");
      this.maskCanvas.width = mw;
      this.maskCanvas.height = mh;
      this.maskCtx = this.maskCanvas.getContext("2d");
      this.maskImg = this.maskCtx.createImageData(mw, mh);
    }
    if (!this.person || this.person.width !== W || this.person.height !== H) {
      this.person = document.createElement("canvas");
      this.person.width = W;
      this.person.height = H;
      this.personCtx = this.person.getContext("2d");
      this.small = document.createElement("canvas");
      this.small.width = Math.max(1, Math.round(W / 16));
      this.small.height = Math.max(1, Math.round(H / 16));
      this.smallCtx = this.small.getContext("2d");
    }
  },

  frame({ video, ts, ctx, canvas }) {
    const W = canvas.width, H = canvas.height;
    const r = this.task.segmentForVideo(video, ts);
    const mask = r.confidenceMasks?.[0];
    if (!mask) { r.close?.(); return; }

    const mw = mask.width, mh = mask.height;
    const data = mask.getAsFloat32Array();
    this.ensureCanvases(mw, mh, W, H);

    // Máscara -> canal alfa (com transição suave na borda)
    const px = this.maskImg.data;
    for (let i = 0, j = 3; i < data.length; i++, j += 4) {
      const v = (data[i] - 0.25) * 2.5;
      px[j] = v <= 0 ? 0 : v >= 1 ? 255 : v * 255;
    }
    this.maskCtx.putImageData(this.maskImg, 0, 0);
    r.close?.();

    // Camada da pessoa recortada
    const pc = this.personCtx;
    pc.globalCompositeOperation = "copy";
    pc.drawImage(video, 0, 0, W, H);
    pc.globalCompositeOperation = "destination-in";
    pc.drawImage(this.maskCanvas, 0, 0, W, H);
    pc.globalCompositeOperation = "source-over";

    // Fundo
    this.drawBackground(ctx, video, W, H);
    ctx.drawImage(this.person, 0, 0);
  },

  drawBackground(ctx, video, W, H) {
    ctx.save();
    if (this.effect === "cor") {
      ctx.fillStyle = this.color;
      ctx.fillRect(0, 0, W, H);
    } else if (this.effect === "imagem" && this.image) {
      // "cover": preenche tudo mantendo a proporção
      const img = this.image;
      const k = Math.max(W / img.width, H / img.height);
      const w = img.width * k, hh = img.height * k;
      ctx.drawImage(img, (W - w) / 2, (H - hh) / 2, w, hh);
    } else if (this.effect === "pb") {
      ctx.drawImage(video, 0, 0, W, H);
      ctx.globalCompositeOperation = "saturation";
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, W, H);
    } else {
      // Desfoque
      const k = W / 640;
      if (hasFilter) {
        const pad = this.blur * 2 * k;
        ctx.filter = `blur(${this.blur * k}px)`;
        ctx.drawImage(video, -pad, -pad, W + pad * 2, H + pad * 2);
      } else {
        // Alternativa para navegadores sem ctx.filter: reduz e amplia
        this.smallCtx.drawImage(video, 0, 0, this.small.width, this.small.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(this.small, 0, 0, W, H);
      }
    }
    ctx.restore();
  },
};
