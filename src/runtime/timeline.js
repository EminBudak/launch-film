// ─── launch-film timeline ──────────────────────────────────────────────────
// The part of a tweening library that the pages use, small enough to read:
// one paused timeline of from / to / fromTo / set tweens, split text with
// masks, and stroke drawing. The renderer seeks the timeline to each frame's
// time, so every frame is a function of time alone.
//
// It runs in the page. The API follows the shape that motion designers know
// (gsap.timeline, tl.from(targets, vars, position), "expo.out" eases,
// "+=" values), so a scene reads the same as one written for a full library.
(() => {
  "use strict";

  // ─── eases ───────────────────────────────────────────────────────────────
  // Each family is its ease-in; out and inOut are made from it.
  const PI = Math.PI;
  const families = {
    power0: () => (p) => p,
    power1: () => (p) => p * p,
    power2: () => (p) => p ** 3,
    power3: () => (p) => p ** 4,
    power4: () => (p) => p ** 5,
    sine: () => (p) => (p === 1 ? 1 : 1 - Math.cos((p * PI) / 2)),
    expo: () => (p) => (p ? 2 ** (10 * (p - 1)) : 0),
    circ: () => (p) => -(Math.sqrt(1 - p * p) - 1),
    back: (s = 1.70158) => (p) => (p ? p * p * ((s + 1) * p - s) : 0),
    elastic: (amplitude = 1, period = 0.3) => {
      const a = Math.max(1, amplitude);
      const k = period / (amplitude < 1 ? amplitude : 1);
      const shift = (k / (2 * PI)) * (Math.asin(1 / a) || 0);
      const out = (p) => (p === 1 ? 1 : a * 2 ** (-10 * p) * Math.sin(((p - shift) * 2 * PI) / k) + 1);
      return (p) => 1 - out(1 - p);
    },
    bounce: () => {
      const out = (p) => {
        const n = 7.5625;
        if (p < 1 / 2.75) return n * p * p;
        if (p < 2 / 2.75) return n * (p -= 1.5 / 2.75) * p + 0.75;
        if (p < 2.5 / 2.75) return n * (p -= 2.25 / 2.75) * p + 0.9375;
        return n * (p -= 2.625 / 2.75) * p + 0.984375;
      };
      return (p) => 1 - out(1 - p);
    },
  };
  families.quad = families.power1;
  families.cubic = families.power2;
  families.quart = families.power3;
  families.quint = families.power4;
  families.strong = families.power4;
  const easeCache = new Map();
  function ease(name) {
    if (typeof name === "function") return name;
    const key = String(name || "power1.out").trim();
    if (easeCache.has(key)) return easeCache.get(key);
    let fn;
    const steps = /^steps\((\d+)\)$/i.exec(key);
    const m = /^([a-z]+\d?)(?:\.(in|out|inOut))?(?:\(([^)]*)\))?$/i.exec(key);
    if (steps) {
      const n = Math.max(1, Number(steps[1]));
      fn = (p) => (p >= 1 ? 1 : Math.floor(p * n) / n);
    } else if (/^(none|linear)$/i.test(key)) fn = (p) => p;
    else if (m && families[m[1].toLowerCase()]) {
      const args = (m[3] || "").split(",").map((v) => v.trim()).filter(Boolean).map(Number);
      const easeIn = families[m[1].toLowerCase()](...args);
      const type = m[2] || "out";
      fn = type === "in" ? easeIn : type === "inOut"
        ? (p) => (p < 0.5 ? easeIn(p * 2) / 2 : 1 - easeIn((1 - p) * 2) / 2)
        : (p) => 1 - easeIn(1 - p);
    } else fn = ease("power1.out");
    easeCache.set(key, fn);
    return fn;
  }

  // ─── values ──────────────────────────────────────────────────────────────
  const TRANSFORMS = { x: 0, y: 0, z: 0, xPercent: 0, yPercent: 0, rotation: 0, rotationX: 0, rotationY: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 };
  const ALIASES = { rotate: "rotation", rotationZ: "rotation", rotateX: "rotationX", rotateY: "rotationY" };
  const UNITLESS = new Set(["opacity", "zIndex", "fontWeight", "lineHeight", "flexGrow", "flexShrink", "order", "scale"]);
  // Not tweened: set when the tween starts.
  const RESERVED = new Set(["duration", "ease", "stagger", "delay", "repeat", "yoyo", "onUpdate", "onComplete", "onStart", "immediateRender", "overwrite", "transformOrigin"]);

  const NUM = /(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-z%]*)/gi;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const isElement = (t) => t && typeof t === "object" && t.nodeType === 1;

  // Colours become rgba(r, g, b, a), so a hex and a computed rgb() line up.
  function rgbaOf(hex) {
    let h = hex.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    const a = h.length === 8 ? n(6) / 255 : 1;
    return `rgba(${n(0)}, ${n(2)}, ${n(4)}, ${+a.toFixed(3)})`;
  }
  function normalise(value) {
    return String(value)
      .replace(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi, (m) => rgbaOf(m))
      .replace(/rgb\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*\)/gi, "rgba($1, $2, $3, 1)")
      .replace(/rgba\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)[\s,/]+([\d.]+%?)\s*\)/gi, (m, r, g, b, a) =>
        `rgba(${r}, ${g}, ${b}, ${/%$/.test(a) ? parseFloat(a) / 100 : a})`)
      .trim();
  }
  function tokens(value) {
    const out = { nums: [], units: [], parts: [] };
    let last = 0;
    String(value).replace(NUM, (m, num, unit, at) => {
      out.parts.push(value.slice(last, at));
      out.nums.push(Number(num));
      out.units.push(unit);
      last = at + m.length;
      return m;
    });
    out.parts.push(value.slice(last));
    return out;
  }
  // The neutral value of a filter or shadow, for a tween that starts from
  // "none": no blur, full brightness, a shadow with no size and no colour.
  const FILTER_ZERO = { blur: "0px", brightness: "1", contrast: "1", saturate: "1", grayscale: "0", sepia: "0", invert: "0", opacity: "1", "hue-rotate": "0deg" };
  function neutralOf(prop, end) {
    if (prop === "filter" || prop === "backdropFilter") {
      return end.replace(/([a-z-]+)\(([^()]*(?:\([^()]*\))?[^()]*)\)/gi, (m, fn) =>
        fn === "drop-shadow" ? "drop-shadow(rgba(0, 0, 0, 0) 0px 0px 0px)" : `${fn}(${FILTER_ZERO[fn] || "0"})`);
    }
    return end.replace(/rgba\(([\d.]+), ([\d.]+), ([\d.]+), [\d.]+\)/g, "rgba($1, $2, $3, 0)").replace(NUM, (m, num, unit) => `0${unit}`);
  }
  // A tween between two strings moves every number in them; strings that do
  // not line up change at half way.
  function stringTween(prop, from, to) {
    let a = normalise(from);
    const b = normalise(to);
    if (a === "none" || a === "" || a === "auto") a = neutralOf(prop, b);
    const ta = tokens(a);
    const tb = tokens(b);
    if (ta.nums.length !== tb.nums.length || !ta.nums.length) return (p) => (p < 0.5 ? from : to);
    return (p) => {
      if (p >= 1) return to;
      let s = tb.parts[0];
      for (let i = 0; i < tb.nums.length; i++) {
        const v = ta.nums[i] + (tb.nums[i] - ta.nums[i]) * p;
        s += +v.toFixed(4) + (tb.units[i] || ta.units[i]) + tb.parts[i + 1];
      }
      return s;
    };
  }
  // "+=12", "-=12", "*=1.1", "/=2" against the value the tween starts from.
  function relative(base, value) {
    if (typeof value !== "string") return value;
    const m = /^([+\-*/])=\s*(-?[\d.]+)([a-z%]*)$/i.exec(value.trim());
    if (!m) return value;
    const b = parseFloat(base) || 0;
    const v = Number(m[2]);
    const out = m[1] === "+" ? b + v : m[1] === "-" ? b - v : m[1] === "*" ? b * v : b / v;
    return m[3] ? `${out}${m[3]}` : out;
  }

  // ─── element state ───────────────────────────────────────────────────────
  // Each element's transform is kept as parts and written as one string. A
  // transform the element already has inline is read into the parts; one the
  // parts cannot hold stays after them.
  const states = new WeakMap();
  function parseTransform(text) {
    const tf = { ...TRANSFORMS };
    const fns = [...String(text).matchAll(/([a-z0-9]+)\(([^)]*)\)/gi)];
    const leftover = String(text).replace(/([a-z0-9]+)\(([^)]*)\)/gi, "").trim();
    if (leftover) return null;
    const len = (v) => {
      const m = /^(-?[\d.]+)(px|%)?$/.exec(v.trim());
      return m ? { v: Number(m[1]), pct: m[2] === "%" } : null;
    };
    const deg = (v) => {
      const m = /^(-?[\d.]+)(deg|rad|turn)?$/.exec(v.trim());
      if (!m) return null;
      const n = Number(m[1]);
      return m[2] === "rad" ? (n * 180) / PI : m[2] === "turn" ? n * 360 : n;
    };
    for (const [, fn, raw] of fns) {
      const args = raw.split(",");
      const put = (axis, value) => {
        const l = len(value);
        if (!l) throw new Error("unit");
        if (axis === "z") tf.z += l.v;
        else if (l.pct) tf[`${axis}Percent`] += l.v;
        else tf[axis] += l.v;
      };
      try {
        switch (fn) {
          case "translate": put("x", args[0]); if (args[1]) put("y", args[1]); break;
          case "translateX": put("x", args[0]); break;
          case "translateY": put("y", args[0]); break;
          case "translateZ": put("z", args[0]); break;
          case "translate3d": put("x", args[0]); put("y", args[1]); put("z", args[2]); break;
          case "rotate": case "rotateZ": tf.rotation += deg(args[0]); break;
          case "rotateX": tf.rotationX += deg(args[0]); break;
          case "rotateY": tf.rotationY += deg(args[0]); break;
          case "scale": tf.scaleX *= Number(args[0]); tf.scaleY *= Number(args[1] === undefined ? args[0] : args[1]); break;
          case "scaleX": tf.scaleX *= Number(args[0]); break;
          case "scaleY": tf.scaleY *= Number(args[0]); break;
          default: return null;
        }
      } catch {
        return null;
      }
      if (Object.values(tf).some((v) => !Number.isFinite(v))) return null;
    }
    return tf;
  }
  function stateOf(el) {
    let st = states.get(el);
    if (st) return st;
    st = { tf: { ...TRANSFORMS }, suffix: "", transformed: false };
    if (isElement(el)) {
      const inline = el.style.transform;
      if (inline && inline !== "none") {
        const parsed = parseTransform(inline);
        if (parsed) st.tf = parsed;
        else st.suffix = inline;
      } else {
        const computed = getComputedStyle(el).transform;
        if (computed && computed !== "none") st.suffix = computed;
      }
    }
    states.set(el, st);
    return st;
  }
  const r4 = (v) => +v.toFixed(4);
  function writeTransform(el, st) {
    const t = st.tf;
    const parts = [];
    if (t.xPercent || t.yPercent) parts.push(`translate(${r4(t.xPercent)}%, ${r4(t.yPercent)}%)`);
    const deep = t.z || t.rotationX || t.rotationY;
    if (deep) parts.push(`translate3d(${r4(t.x)}px, ${r4(t.y)}px, ${r4(t.z)}px)`);
    else if (t.x || t.y) parts.push(`translate(${r4(t.x)}px, ${r4(t.y)}px)`);
    if (t.rotation) parts.push(`rotate(${r4(t.rotation)}deg)`);
    if (t.rotationY) parts.push(`rotateY(${r4(t.rotationY)}deg)`);
    if (t.rotationX) parts.push(`rotateX(${r4(t.rotationX)}deg)`);
    if (t.skewX || t.skewY) parts.push(`skew(${r4(t.skewX)}deg, ${r4(t.skewY)}deg)`);
    if (t.scaleX !== 1 || t.scaleY !== 1) parts.push(`scale(${r4(t.scaleX)}, ${r4(t.scaleY)})`);
    if (st.suffix) parts.push(st.suffix);
    el.style.transform = parts.join(" ") || "none";
  }

  // drawSVG: the visible part of a stroke as [start, end] shares of its length.
  function strokeLength(el) {
    try {
      return el.getTotalLength();
    } catch {
      return 0;
    }
  }
  function parseDraw(value, L) {
    const parts = String(value).trim().split(/\s+/);
    const share = (v) => (/%$/.test(v) ? parseFloat(v) / 100 : L ? parseFloat(v) / L : 0);
    if (parts.length === 1) return [0, share(parts[0])];
    return [share(parts[0]), share(parts[1])];
  }
  function writeDraw(el, [a, b]) {
    const L = strokeLength(el);
    const len = Math.max(0, (b - a) * L);
    el.style.strokeDasharray = `${r4(len)} ${r4(L + 1)}`;
    el.style.strokeDashoffset = `${r4(-a * L)}`;
    // A stroke with round caps still shows a dot at no length.
    el.style.visibility = len < 0.5 ? "hidden" : "";
  }

  // The value a property has now, as a number or a string.
  function readValue(el, prop) {
    if (prop in TRANSFORMS) return stateOf(el).tf[prop];
    if (prop === "drawSVG") return stateOf(el).draw || [0, 1];
    if (!isElement(el)) return el[prop];
    const v = el.style[prop] || getComputedStyle(el)[prop];
    return v === undefined ? el.getAttribute(prop) : v;
  }
  function writeValue(el, prop, value) {
    if (prop in TRANSFORMS) {
      const st = stateOf(el);
      st.tf[prop] = value;
      st.dirty = true;
    } else if (prop === "drawSVG") {
      stateOf(el).draw = value;
      writeDraw(el, value);
    } else if (!isElement(el)) el[prop] = value;
    else el.style[prop] = value;
  }
  function flush(el) {
    const st = states.get(el);
    if (st && st.dirty && isElement(el)) {
      writeTransform(el, st);
      st.dirty = false;
    }
  }

  // An interpolator from a to b for one property.
  function between(el, prop, a, b) {
    if (prop === "drawSVG") return (p) => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
    const na = typeof a === "number" ? a : parseFloat(a);
    const nb = typeof b === "number" ? b : parseFloat(b);
    const pureNumber = (v) => typeof v === "number" || /^\s*-?[\d.]+(e[-+]?\d+)?[a-z%]*\s*$/i.test(String(v));
    if (pureNumber(a) && pureNumber(b) && Number.isFinite(na) && Number.isFinite(nb)) {
      if (prop in TRANSFORMS || !isElement(el)) return (p) => na + (nb - na) * p;
      const unit = String(b).replace(/^\s*-?[\d.]+(e[-+]?\d+)?/i, "").trim() || String(a).replace(/^\s*-?[\d.]+(e[-+]?\d+)?/i, "").trim() ||
        (UNITLESS.has(prop) ? "" : "px");
      return (p) => `${r4(na + (nb - na) * p)}${unit}`;
    }
    return stringTween(prop, String(a), String(b));
  }

  // ─── targets ─────────────────────────────────────────────────────────────
  // An array inside the list is one target of several elements that move as
  // one (a line of words).
  function targetsOf(t) {
    if (typeof t === "string") return [...document.querySelectorAll(t)];
    if (t == null) return [];
    if (isElement(t)) return [t];
    if (Array.isArray(t) || (typeof NodeList !== "undefined" && t instanceof NodeList)) {
      return [...t].flatMap((x) => (Array.isArray(x) ? [x] : targetsOf(x)));
    }
    return [t];
  }
  const members = (target) => (Array.isArray(target) ? target : [target]);

  // ─── tweens ──────────────────────────────────────────────────────────────
  // One tween per target; the tweens of a call share its vars and callbacks.
  class Track {
    constructor(owner, target, start, kind, fromVars, toVars) {
      Object.assign(this, { owner, target, start, kind, fromVars, toVars });
      this.duration = Math.max(0, Number(toVars.duration ?? (kind === "set" ? 0 : 0.5)));
      this.ease = ease(toVars.ease);
      this.repeat = Math.max(0, Math.floor(Number(toVars.repeat) || 0));
      this.yoyo = Boolean(toVars.yoyo);
      this.props = Object.keys(kind === "from" ? fromVars : toVars).filter((k) => !RESERVED.has(k)).map((k) => ALIASES[k] || k);
      if (kind === "fromTo") for (const k of Object.keys(fromVars)) if (!RESERVED.has(k) && !this.props.includes(ALIASES[k] || k)) this.props.push(ALIASES[k] || k);
      this.ready = false;
      // from and fromTo show their start at once, as a page expects of an
      // entrance before its time.
      if (kind === "from" || kind === "fromTo") this.init();
    }
    vars(source, prop) {
      for (const [k, v] of Object.entries(source)) if ((ALIASES[k] || k) === prop) return v;
      return undefined;
    }
    init() {
      const el = members(this.target)[0];
      const origin = this.vars(this.fromVars, "transformOrigin") ?? this.vars(this.toVars, "transformOrigin");
      if (origin) for (const m of members(this.target)) if (isElement(m)) m.style.transformOrigin = origin;
      this.lerps = {};
      for (const prop of this.props) {
        if (prop === "scale") continue;
        const now = readValue(el, prop);
        let a;
        let b;
        if (this.kind === "from") {
          a = relative(now, this.vars(this.fromVars, prop));
          b = now;
        } else if (this.kind === "fromTo") {
          a = this.vars(this.fromVars, prop) ?? now;
          b = relative(a, this.vars(this.toVars, prop) ?? now);
        } else {
          a = now;
          b = relative(now, this.vars(this.toVars, prop));
        }
        if (prop === "drawSVG") {
          const L = isElement(el) ? strokeLength(el) : 0;
          a = Array.isArray(a) ? a : parseDraw(a, L);
          b = Array.isArray(b) ? b : parseDraw(b, L);
        }
        this.lerps[prop] = between(el, prop, a, b);
      }
      // scale moves both axes.
      if (this.props.includes("scale")) {
        for (const axis of ["scaleX", "scaleY"]) {
          const now = readValue(el, axis);
          const given = (src) => this.vars(src, "scale");
          let a;
          let b;
          if (this.kind === "from") [a, b] = [relative(now, given(this.fromVars)), now];
          else if (this.kind === "fromTo") {
            a = given(this.fromVars) ?? now;
            b = relative(a, given(this.toVars) ?? now);
          } else [a, b] = [now, relative(now, given(this.toVars))];
          this.lerps[axis] = between(el, axis, Number(a), Number(b));
        }
      }
      this.ready = true;
    }
    // The tween's own progress at a time inside it, repeats and yoyo counted.
    progressAt(local) {
      const d = this.duration;
      if (d <= 0) return 1;
      const total = d * (this.repeat + 1);
      const t = Math.min(local, total);
      let cycle = Math.floor(t / d);
      let within = t - cycle * d;
      if (cycle > this.repeat) {
        cycle = this.repeat;
        within = d;
      }
      if (t >= total) {
        cycle = this.repeat;
        within = d;
      }
      let p = within / d;
      if (this.yoyo && cycle % 2 === 1) p = 1 - p;
      return clamp01(p);
    }
    apply(eased, only = null) {
      for (const m of members(this.target)) {
        for (const [prop, lerp] of Object.entries(this.lerps)) {
          if (only && !only(m, prop)) continue;
          writeValue(m, prop, lerp(eased));
        }
        flush(m);
      }
    }
    get end() {
      return this.start + this.duration * (this.repeat + 1);
    }
  }

  class Timeline {
    constructor(vars = {}) {
      this.vars = vars;
      this.tracks = [];
      this.calls = [];
      this.last = { start: 0, end: 0 };
      this.time = 0;
    }
    position(pos) {
      const end = this.duration();
      if (pos === undefined || pos === null) return end;
      if (typeof pos === "number") return pos;
      const s = String(pos).trim();
      if (s === "<") return this.last.start;
      if (s === ">") return this.last.end;
      const m = /^([<>])?([+-]=)?(-?[\d.]+)$/.exec(s);
      if (m) {
        const base = m[1] === "<" ? this.last.start : m[1] === ">" ? this.last.end : m[2] ? end : 0;
        const v = Number(m[3]);
        return m[2] === "-=" ? base - v : base + v;
      }
      return end;
    }
    add(kind, targets, fromVars, toVars, pos) {
      const at = Math.max(0, this.position(pos)) + Math.max(0, Number(toVars.delay) || 0);
      const list = targetsOf(targets);
      const st = toVars.stagger;
      const each = typeof st === "number" ? st : st && typeof st === "object" ? Number(st.each) || (Number(st.amount) || 0) / Math.max(1, list.length - 1) : 0;
      const call = { tracks: [], vars: toVars, start: at };
      const order = st && typeof st === "object" && st.from === "end" ? list.map((_, i) => list.length - 1 - i)
        : st && typeof st === "object" && st.from === "center" ? list.map((_, i) => Math.abs(i - (list.length - 1) / 2)) : list.map((_, i) => i);
      list.forEach((target, i) => {
        const track = new Track(call, target, at + order[i] * each, kind, fromVars, toVars);
        call.tracks.push(track);
        this.tracks.push(track);
      });
      if (!list.length) call.tracks.push({ start: at, duration: Number(toVars.duration) || 0, repeat: 0, end: at + (Number(toVars.duration) || 0) });
      call.end = Math.max(at, ...call.tracks.map((t) => t.end));
      this.calls.push(call);
      this.last = { start: at, end: call.end };
      // Tracks are rendered in start order: a later tween on a property wins.
      this.tracks.sort((a, b) => a.start - b.start);
      return this;
    }
    to(targets, vars, pos) { return this.add("to", targets, {}, vars || {}, pos); }
    from(targets, vars, pos) { return this.add("from", targets, vars || {}, vars || {}, pos); }
    fromTo(targets, fromVars, toVars, pos) { return this.add("fromTo", targets, fromVars || {}, toVars || {}, pos); }
    set(targets, vars, pos) { return this.add("set", targets, {}, { ...(vars || {}), duration: 0 }, pos); }
    duration() {
      return this.calls.reduce((m, c) => Math.max(m, c.end), 0);
    }
    seek(seconds) {
      const T = Math.max(0, Number(seconds) || 0);
      this.time = T;
      // Properties a started tween wrote at this time: a tween still to
      // come shows its start only where no earlier one is moving.
      const touched = new Map();
      const touch = (m, prop) => {
        let set = touched.get(m);
        if (!set) touched.set(m, (set = new Set()));
        set.add(prop);
      };
      const isTouched = (m, prop) => (touched.get(m) || new Set()).has(prop);
      for (const track of this.tracks) {
        if (!(track instanceof Track)) continue;
        const local = T - track.start;
        if (local < 0) {
          if (track.kind === "from" || track.kind === "fromTo" || track.ready) {
            if (!track.ready) track.init();
            track.apply(track.ease(track.kind === "to" || track.kind === "set" ? 0 : 0), (m, prop) => {
              const axis = prop === "scaleX" || prop === "scaleY" ? prop : prop;
              if (isTouched(m, axis)) return false;
              touch(m, axis);
              return true;
            });
          }
          continue;
        }
        if (!track.ready) track.init();
        const p = track.progressAt(local);
        track.apply(track.ease(p));
        for (const m of members(track.target)) for (const prop of Object.keys(track.lerps)) touch(m, prop);
      }
      for (const call of this.calls) {
        const fn = call.vars.onUpdate;
        if (typeof fn !== "function" || T < call.start) continue;
        const span = Math.max(1e-6, call.end - call.start);
        const progress = clamp01((T - call.start) / span);
        try {
          fn.call({ progress: () => progress, time: () => T - call.start });
        } catch (e) {
          console.error(e);
        }
      }
      return this;
    }
    progress() {
      const d = this.duration();
      return d ? clamp01(this.time / d) : 1;
    }
  }

  // ─── split text ──────────────────────────────────────────────────────────
  // Words (and their letters) each in an inline block, each in a mask when
  // asked: a word rises out of its own clip. "lines" groups the words by the
  // line they sit on, and a line moves as one.
  const graphemes = (text) => {
    try {
      return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
    } catch {
      return [...text];
    }
  };
  class SplitText {
    constructor(target, vars = {}) {
      const el = targetsOf(target)[0];
      const types = String(vars.type || "words").split(",").map((s) => s.trim());
      const mask = vars.mask ? String(vars.mask) : "";
      this.words = [];
      this.chars = [];
      this.lines = [];
      if (!el) return;
      const doc = el.ownerDocument;
      const box = (cls, display = "inline-block") => {
        const s = doc.createElement("span");
        s.className = cls;
        s.style.display = display;
        s.style.position = "relative";
        return s;
      };
      const masked = (node) => {
        const m = box("lf-mask");
        m.style.overflow = "clip";
        m.style.overflowClipMargin = "0.15em";
        node.replaceWith(m);
        m.appendChild(node);
        return node;
      };
      // Splits on spaces, never on a no-break space (a separator glued to
      // its word stays at the end of the line).
      const walk = (node) => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === 3) {
            const parts = child.textContent.split(/([^\S\u00a0]+)/);
            const frag = doc.createDocumentFragment();
            for (const part of parts) {
              if (!part) continue;
              if (/^[^\S\u00a0]+$/.test(part)) frag.appendChild(doc.createTextNode(part));
              else {
                const w = box("lf-word");
                w.textContent = part;
                frag.appendChild(w);
                this.words.push(w);
              }
            }
            child.replaceWith(frag);
          } else if (child.nodeType === 1 && !/^(BR|SVG|IMG)$/i.test(child.tagName)) walk(child);
        }
      };
      walk(el);
      if (types.includes("chars")) {
        for (const w of this.words) {
          const text = w.textContent;
          w.textContent = "";
          for (const g of graphemes(text)) {
            const c = box("lf-char");
            c.textContent = g;
            w.appendChild(c);
            this.chars.push(c);
          }
        }
      }
      if (types.includes("lines")) {
        let top = null;
        let line = null;
        for (const w of this.words) {
          const y = Math.round(w.offsetTop);
          if (line === null || Math.abs(y - top) > 2) {
            line = [];
            this.lines.push(line);
            top = y;
          }
          line.push(w);
        }
      }
      if (mask === "chars") this.chars.forEach(masked);
      else if (mask === "words" || mask === "lines") this.words.forEach(masked);
    }
  }

  const gsapLike = {
    timeline: (vars) => new Timeline(vars),
    registerPlugin: () => {},
    // A one-off set outside any timeline.
    set(targets, vars) {
      new Timeline().set(targets, vars, 0).seek(0);
    },
    parseEase: ease,
  };
  window.gsap = gsapLike;
  window.SplitText = SplitText;
  window.DrawSVGPlugin = {};
})();
