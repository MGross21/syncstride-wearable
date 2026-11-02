const COLORS = {
  grid: 'rgba(255, 255, 255, 0.06)',
  zero: 'rgba(255, 255, 255, 0.18)',
  label: 'rgba(230, 237, 243, 0.45)',
  trace: '#f4f7fa',
  fwd: '#d8f41d',
  back: '#5cc8ff',
  idle: 'rgba(255, 255, 255, 0.35)'
};

const PAD = { left: 40, right: 12, top: 12, bottom: 24 };

// Scrolling pitch-vs-time plot drawn straight to a canvas. Samples are { t, p } in
// seconds and degrees; the newest sample is pinned to the right edge.
export class StripChart {
  constructor(canvas, { windowSec = 10 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.windowSec = windowSec;
    this.yMax = 60;
    new ResizeObserver(() => this.#resize()).observe(canvas);
    this.#resize();
  }

  #resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(samples, { fwd, back, idle }) {
    const { ctx, w, h, windowSec } = this;
    if (!w || !h) return;

    const x0 = PAD.left, x1 = w - PAD.right, y0 = PAD.top, y1 = h - PAD.bottom;
    const tNow = samples.at(-1)?.t ?? 0;

    // Ease the vertical range so it never jumps while the trace is moving.
    let peak = Math.max(Math.abs(fwd), Math.abs(back));
    for (const s of samples) peak = Math.max(peak, Math.abs(s.p));
    const goal = Math.max(45, Math.ceil((peak + 10) / 15) * 15);
    this.yMax += (goal - this.yMax) * 0.08;
    const yMax = this.yMax;

    const X = t => x1 - ((tNow - t) / windowSec) * (x1 - x0);
    const Y = p => y0 + ((yMax - p) / (2 * yMax)) * (y1 - y0);

    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px "Roboto Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    // Target zones above the forward line and below the backward line.
    const yF = Y(fwd), yB = Y(back);
    ctx.fillStyle = 'rgba(216, 244, 29, 0.07)';
    ctx.fillRect(x0, y0, x1 - x0, Math.max(0, yF - y0));
    ctx.fillStyle = 'rgba(92, 200, 255, 0.07)';
    ctx.fillRect(x0, yB, x1 - x0, Math.max(0, y1 - yB));

    // Horizontal grid and degree labels.
    const step = yMax > 90 ? 30 : 15;
    ctx.textAlign = 'right';
    for (let v = -Math.floor(yMax / step) * step; v <= yMax; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = v === 0 ? COLORS.zero : COLORS.grid;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillStyle = COLORS.label;
      ctx.fillText(`${v}°`, x0 - 8, y);
    }

    // Seconds-ago labels.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let s = 0; s <= windowSec; s += 2) {
      const x = x1 - (s / windowSec) * (x1 - x0);
      ctx.fillText(s === 0 ? 'now' : `-${s}s`, x, y1 + 8);
    }

    const dashed = (y, color, dash) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.restore();
    };
    dashed(yF, COLORS.fwd, [6, 5]);
    dashed(yB, COLORS.back, [6, 5]);
    if (idle != null) dashed(Y(idle), COLORS.idle, [2, 4]);

    if (samples.length < 2) return;

    const path = new Path2D();
    let started = false;
    for (const s of samples) {
      if (tNow - s.t > windowSec) continue;
      started ? path.lineTo(X(s.t), Y(s.p)) : path.moveTo(X(s.t), Y(s.p));
      started = true;
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLORS.trace;
    ctx.stroke(path);

    // Re-stroke the parts of the trace that sit inside a target zone in its colour.
    for (const [top, bottom, color] of [[y0, yF, COLORS.fwd], [yB, y1, COLORS.back]]) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, top, x1 - x0, Math.max(0, bottom - top)); ctx.clip();
      ctx.strokeStyle = color;
      ctx.stroke(path);
      ctx.restore();
    }

    const last = samples.at(-1);
    ctx.fillStyle = last.p >= fwd ? COLORS.fwd : last.p <= back ? COLORS.back : COLORS.trace;
    ctx.beginPath(); ctx.arc(X(last.t), Y(last.p), 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
