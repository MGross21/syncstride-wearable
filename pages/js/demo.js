const RATE_HZ = 50;
const POSE_HOLD_MS = 900;

// Simulated wrist: a walking arm swing with a weaker backswing (common in
// Parkinson's), slow amplitude drift, sensor noise and a faint 5 Hz tremor.
export class DemoSource {
  constructor(onSample) {
    this.onSample = onSample;
    this.amplitude = 30;
    this.cadence = 100;
    this.thresholds = { fwd: 25, back: -25 };
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.t = 0;
    this.phase = 0;
    this.pitch = 0;
    this.pose = null;
    this.timer = setInterval(() => this.#tick(1 / RATE_HZ), 1000 / RATE_HZ);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  // Moves the arm to the calibration pose, holds it, then records the threshold
  // from wherever the arm ends up, the same way the firmware does.
  calibrate(command) {
    const back = -this.amplitude * 0.75;
    const poses = { 1: 0, 2: this.amplitude * 0.85, 3: back * 0.85 };
    return new Promise(resolve => {
      this.pose = {
        target: poses[command],
        done: () => {
          const p = this.pitch;
          if (command === 2) this.thresholds.fwd = p;
          if (command === 3) this.thresholds.back = p;
          resolve(p);
        },
        until: performance.now() + POSE_HOLD_MS
      };
    });
  }

  #tick(dt) {
    this.t += dt;
    const { t } = this;
    let target;

    if (this.pose) {
      target = this.pose.target;
      if (performance.now() >= this.pose.until) {
        this.pose.done();
        this.pose = null;
      }
    } else {
      this.phase += 2 * Math.PI * (this.cadence / 120) * dt;
      const drift = 1 + 0.16 * Math.sin(t * 0.37) + 0.07 * Math.sin(t * 1.3 + 1);
      const s = Math.sin(this.phase) + 0.15 * Math.sin(2 * this.phase + 0.6);
      target = 2 + this.amplitude * drift * (s >= 0 ? s : 0.75 * s);
    }

    const noise = (Math.random() + Math.random() - 1) * 0.6 + 0.35 * Math.sin(2 * Math.PI * 5 * t);
    this.pitch += (target - this.pitch) * Math.min(1, dt * 12);

    this.onSample({
      t,
      pitch: this.pitch + noise,
      fwd: this.thresholds.fwd,
      back: this.thresholds.back
    });
  }
}
