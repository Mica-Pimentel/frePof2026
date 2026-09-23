// Pequenos utilitários de interface usados pelos modos.

/** Cria um elemento: h("div", { class: "x", onClick: fn }, "texto", filho) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function section(title, ...children) {
  return h("div", { class: "section" }, title ? h("div", { class: "section-title" }, title) : null, ...children);
}

/** Barra de progresso com nome e valor. */
export function bar(name, { mono = false } = {}) {
  const nameEl = h("span", { class: "bar-name" + (mono ? " mono" : "") }, name);
  const valEl = h("span", { class: "bar-val" }, "0%");
  const fill = h("div", { class: "bar-fill" });
  const el = h("div", { class: "bar-row" }, nameEl, valEl, h("div", { class: "bar-track" }, fill));
  return {
    el,
    set(v, label) {
      const p = Math.max(0, Math.min(1, v || 0));
      fill.style.width = `${(p * 100).toFixed(1)}%`;
      valEl.textContent = `${Math.round(p * 100)}%`;
      if (label != null) nameEl.textContent = label;
    },
  };
}

/** Caixinha de número com legenda. */
export function stat(label, { big = false, value = "0" } = {}) {
  const v = h("div", { class: "stat-value" }, value);
  const el = h("div", { class: "stat" + (big ? " big" : "") }, v, h("div", { class: "stat-label" }, label));
  let last = value;
  return {
    el,
    set(x) {
      const s = String(x);
      if (s !== last) { v.textContent = s; last = s; }
    },
  };
}

/** Controle segmentado (tipo abas pequenas). */
export function segmented(options, value, onChange) {
  const el = h("div", { class: "seg", role: "group" });
  const buttons = options.map(([val, label]) => {
    const b = h("button", { type: "button", "aria-pressed": String(val === value) }, label);
    b.addEventListener("click", () => {
      buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      onChange(val);
    });
    el.append(b);
    return b;
  });
  return el;
}

/** Interruptor liga/desliga. */
export function toggle(label, checked, onChange) {
  const input = h("input", { type: "checkbox" });
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "switch" }, input, h("span", { class: "knob" }), label);
}

/** Slider com rótulo e valor. */
export function slider(label, { min, max, step = 1, value, format = (v) => v }, onInput) {
  const out = h("span", {}, format(value));
  const input = h("input", { type: "range", min, max, step, value });
  input.addEventListener("input", () => {
    const v = Number(input.value);
    out.textContent = format(v);
    onInput(v);
  });
  return h("div", { class: "field" }, h("div", { class: "field-top" }, h("span", {}, label), out), input);
}

/** Atualiza texto só quando mudar (evita trabalho desnecessário no DOM). */
export function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}
