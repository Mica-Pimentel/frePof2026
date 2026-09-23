// Utilitários de desenho no canvas de sobreposição.

export const INK = "rgba(255, 255, 255, 0.92)";
export const INK_SOFT = "rgba(255, 255, 255, 0.35)";
export const ACCENT = "#5b7cff";
export const PALETTE = ["#5b7cff", "#ff6b6b", "#2fbf71", "#ffb020", "#c77dff", "#22c3e6"];

/** Fator de escala para que linhas/textos fiquem proporcionais à resolução. */
export function scaleOf(canvas) {
  return Math.max(1, canvas.width / 640);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/**
 * Desenha um rótulo legível mesmo quando a imagem está espelhada.
 * (x, y) é o canto inferior-esquerdo *visual* do rótulo.
 */
export function drawLabel(ctx, text, x, y, { mirrored = false, size = 13, bg = "rgba(12,12,16,.72)", fg = "#fff", align = "left" } = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (mirrored) ctx.scale(-1, 1);
  ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
  const pad = size * 0.5;
  const w = ctx.measureText(text).width + pad * 2;
  const hgt = size * 1.7;
  const ox = align === "center" ? -w / 2 : 0;
  ctx.fillStyle = bg;
  roundRect(ctx, ox, -hgt, w, hgt, size * 0.4);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, ox + pad, -hgt / 2 + 0.5);
  ctx.restore();
}

/** Retângulo com cantos arredondados (apenas contorno). */
export function strokeBox(ctx, x, y, w, h, { color = ACCENT, width = 2, radius = 6 } = {}) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  roundRect(ctx, x, y, w, h, radius);
  ctx.stroke();
  ctx.restore();
}

/** Ângulo (em graus) no ponto b formado pelos pontos a-b-c. */
export function angle(a, b, c) {
  const ab = Math.atan2(a.y - b.y, a.x - b.x);
  const cb = Math.atan2(c.y - b.y, c.x - b.x);
  let deg = Math.abs(((ab - cb) * 180) / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return deg;
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
