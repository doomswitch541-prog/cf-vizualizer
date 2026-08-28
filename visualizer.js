const TAU = Math.PI * 2;

function averageRange(values, start, end) {
  if (!values?.length) return 0;
  const safeStart = Math.max(0, Math.min(values.length - 1, start));
  const safeEnd = Math.max(safeStart + 1, Math.min(values.length, end));
  let total = 0;
  for (let index = safeStart; index < safeEnd; index += 1) total += values[index];
  return total / (safeEnd - safeStart) / 255;
}

function hexToRgb(hex) {
  const clean = String(hex || "#ffffff").replace("#", "");
  const expanded = clean.length === 3 ? clean.split("").map((part) => part + part).join("") : clean;
  const numeric = Number.parseInt(expanded, 16);
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255
  };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function pointOnOrbit(centerX, centerY, radiusX, radiusY, angle) {
  return {
    x: centerX + Math.cos(angle) * radiusX,
    y: centerY + Math.sin(angle) * radiusY
  };
}

export class ColdflameVisualizer {
  constructor({ canvas, audio, stage, meters }) {
    this.canvas = canvas;
    this.audio = audio;
    this.stage = stage;
    this.context = canvas.getContext("2d", { alpha: true });
    this.meters = meters;
    this.palette = {
      background: "#08090b",
      surface: "#18181d",
      primary: "#42362a",
      secondary: "#7e96d2",
      accent: "#967e66",
      highlight: "#d7d0c8"
    };
    this.trackIndex = 0;
    this.trackCount = 7;
    this.bass = 0;
    this.mids = 0;
    this.treble = 0;
    this.energyBoost = 0;
    this.frame = 0;
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.frequencyData = null;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(stage);
    this.resize();
    this.bindEnergyLens();
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  async connect() {
    if (!this.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.audioContext = new AudioContext();
      this.source = this.audioContext.createMediaElementSource(this.audio);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === "suspended") await this.audioContext.resume();
    return true;
  }

  setPalette(palette) {
    this.palette = { ...this.palette, ...palette };
  }

  setTrack(index, count = 7) {
    this.trackIndex = index;
    this.trackCount = count;
  }

  resize() {
    const bounds = this.stage.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvas.style.width = `${bounds.width}px`;
      this.canvas.style.height = `${bounds.height}px`;
    }
    this.pixelRatio = ratio;
    this.width = bounds.width;
    this.height = bounds.height;
  }

  bindEnergyLens() {
    const increase = (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      this.energyBoost = 1;
      this.stage.setPointerCapture?.(event.pointerId);
    };
    const release = () => {
      this.energyBoost = 0;
    };
    this.stage.addEventListener("pointerdown", increase);
    this.stage.addEventListener("pointerup", release);
    this.stage.addEventListener("pointercancel", release);
    this.stage.addEventListener("lostpointercapture", release);
  }

  readAudio(time) {
    const playing = !this.audio.paused && !this.audio.ended;
    let targetBass = 0.025;
    let targetMids = 0.02;
    let targetTreble = 0.015;

    if (playing && this.analyser && this.frequencyData) {
      this.analyser.getByteFrequencyData(this.frequencyData);
      targetBass = averageRange(this.frequencyData, 1, 10);
      targetMids = averageRange(this.frequencyData, 10, 42);
      targetTreble = averageRange(this.frequencyData, 42, 104);
    } else if (!this.reducedMotion) {
      targetBass += (Math.sin(time * 0.00052) + 1) * 0.015;
      targetMids += (Math.sin(time * 0.00037 + 1.8) + 1) * 0.01;
      targetTreble += (Math.sin(time * 0.00081 + 4.1) + 1) * 0.006;
    }

    const boost = this.energyBoost * 0.2;
    this.bass += (Math.min(1, targetBass + boost) - this.bass) * 0.12;
    this.mids += (Math.min(1, targetMids + boost * 0.72) - this.mids) * 0.13;
    this.treble += (Math.min(1, targetTreble + boost * 0.45) - this.treble) * 0.16;

    this.stage.style.setProperty("--bass", this.bass.toFixed(3));
    this.stage.style.setProperty("--mids", this.mids.toFixed(3));
    this.stage.style.setProperty("--treble", this.treble.toFixed(3));
    const progress = this.audio.duration ? this.audio.currentTime / this.audio.duration : 0;
    this.stage.style.setProperty("--progress", progress.toFixed(4));

    if (this.frame % 3 === 0) {
      this.meters.bass.style.width = `${Math.max(8, this.bass * 100)}%`;
      this.meters.mids.style.width = `${Math.max(8, this.mids * 100)}%`;
      this.meters.treble.style.width = `${Math.max(8, this.treble * 100)}%`;
    }
  }

  draw(time) {
    const ctx = this.context;
    if (!ctx || !this.width || !this.height) return;

    const ratio = this.pixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const smallest = Math.min(this.width, this.height);
    const coverRadius = Math.min(smallest * 0.245, 205);
    const orbitRadiusX = Math.min(this.width * 0.41, coverRadius * 1.86);
    const orbitRadiusY = Math.min(this.height * 0.39, coverRadius * 1.67);
    const breath = this.reducedMotion ? 0 : Math.sin(time * 0.00038) * 2.5;
    const bassDepth = this.bass * Math.min(42, smallest * 0.055);
    const midBody = this.mids * Math.min(26, smallest * 0.038);
    const trebleLight = Math.min(1, this.treble * 1.65);

    this.drawOuterHalo(ctx, centerX, centerY, orbitRadiusX, orbitRadiusY, breath, bassDepth);
    this.drawArchiveOrbit(ctx, centerX, centerY, orbitRadiusX, orbitRadiusY, trebleLight);
    this.drawSpectrumBody(ctx, centerX, centerY, coverRadius, midBody, time);
    this.drawProgressArc(ctx, centerX, centerY, coverRadius);
    this.drawCornerSignals(ctx, trebleLight, time);
  }

  drawOuterHalo(ctx, centerX, centerY, radiusX, radiusY, breath, bassDepth) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const rings = [
      { scale: 1.03, color: this.palette.primary, alpha: 0.16, width: 1 },
      { scale: 1.13, color: this.palette.secondary, alpha: 0.12, width: 1 },
      { scale: 1.25, color: this.palette.accent, alpha: 0.075, width: 0.8 }
    ];

    rings.forEach((ring, index) => {
      const reactive = bassDepth * (1 - index * 0.17);
      ctx.beginPath();
      ctx.ellipse(
        centerX,
        centerY,
        radiusX * ring.scale + reactive + breath,
        radiusY * ring.scale + reactive * 0.72 + breath,
        0,
        0,
        TAU
      );
      ctx.strokeStyle = rgba(ring.color, ring.alpha + this.bass * 0.1);
      ctx.lineWidth = ring.width;
      ctx.shadowColor = rgba(ring.color, 0.42);
      ctx.shadowBlur = 7 + this.bass * 14;
      ctx.stroke();
    });
    ctx.restore();
  }

  drawArchiveOrbit(ctx, centerX, centerY, radiusX, radiusY, trebleLight) {
    const nodes = Array.from({ length: this.trackCount }, (_, index) => {
      const angle = -Math.PI / 2 + (index / this.trackCount) * TAU;
      return { ...pointOnOrbit(centerX, centerY, radiusX, radiusY, angle), angle, index };
    });

    ctx.save();
    ctx.beginPath();
    nodes.forEach((node, index) => {
      if (index === 0) ctx.moveTo(node.x, node.y);
      else ctx.lineTo(node.x, node.y);
    });
    ctx.closePath();
    ctx.strokeStyle = rgba(this.palette.highlight, 0.105 + this.mids * 0.08);
    ctx.lineWidth = 0.75 + this.mids * 0.75;
    ctx.stroke();

    nodes.forEach((node) => {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(node.x, node.y);
      ctx.strokeStyle = rgba(this.palette.secondary, node.index === this.trackIndex ? 0.19 : 0.055);
      ctx.lineWidth = 0.65;
      ctx.stroke();

      const active = node.index === this.trackIndex;
      const radius = active ? 5.4 + this.bass * 4.2 : 2.1 + trebleLight * 1.6;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, TAU);
      ctx.fillStyle = rgba(active ? this.palette.accent : this.palette.highlight, active ? 0.95 : 0.35 + trebleLight * 0.3);
      ctx.shadowColor = rgba(active ? this.palette.accent : this.palette.secondary, 0.7);
      ctx.shadowBlur = active ? 15 + this.bass * 18 : 4 + trebleLight * 10;
      ctx.fill();

      if (active) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 6 + this.bass * 5, 0, TAU);
        ctx.strokeStyle = rgba(this.palette.highlight, 0.2 + this.treble * 0.28);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  drawSpectrumBody(ctx, centerX, centerY, radius, midBody, time) {
    const points = 72;
    const rotation = this.reducedMotion ? 0 : time * 0.000025;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.beginPath();

    for (let index = 0; index <= points; index += 1) {
      const normalized = index / points;
      const angle = normalized * TAU;
      const bin = this.frequencyData?.length
        ? this.frequencyData[Math.min(this.frequencyData.length - 1, Math.floor(normalized * 84))] / 255
        : 0;
      const symmetry = Math.abs(Math.sin(angle * 3.5));
      const amplitude = midBody * (0.3 + bin * 0.8) + symmetry * this.treble * 5;
      const currentRadius = radius * 1.14 + amplitude;
      const x = Math.cos(angle) * currentRadius;
      const y = Math.sin(angle) * currentRadius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.strokeStyle = rgba(this.palette.highlight, 0.18 + this.mids * 0.38);
    ctx.lineWidth = 0.7 + this.mids * 1.55;
    ctx.shadowColor = rgba(this.palette.secondary, 0.52);
    ctx.shadowBlur = 4 + this.treble * 10;
    ctx.stroke();
    ctx.restore();
  }

  drawProgressArc(ctx, centerX, centerY, radius) {
    const progress = this.audio.duration ? this.audio.currentTime / this.audio.duration : 0;
    const arcRadius = radius * 1.055;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, arcRadius, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
    ctx.strokeStyle = rgba(this.palette.accent, 0.72);
    ctx.lineWidth = 1.5;
    ctx.shadowColor = rgba(this.palette.accent, 0.5);
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  }

  drawCornerSignals(ctx, trebleLight, time) {
    if (trebleLight < 0.05) return;
    const padding = 28;
    const pulse = this.reducedMotion ? 1 : 0.72 + Math.sin(time * 0.004) * 0.2;
    const length = 13 + trebleLight * 10;
    const corners = [
      [padding, padding, 1, 1],
      [this.width - padding, padding, -1, 1],
      [this.width - padding, this.height - padding, -1, -1],
      [padding, this.height - padding, 1, -1]
    ];
    ctx.save();
    ctx.strokeStyle = rgba(this.palette.accent, Math.min(0.5, trebleLight * 0.4) * pulse);
    ctx.lineWidth = 1;
    corners.forEach(([x, y, directionX, directionY]) => {
      ctx.beginPath();
      ctx.moveTo(x, y + directionY * length);
      ctx.lineTo(x, y);
      ctx.lineTo(x + directionX * length, y);
      ctx.stroke();
    });
    ctx.restore();
  }

  tick(time) {
    this.frame += 1;
    this.readAudio(time);
    this.draw(time);
    requestAnimationFrame(this.tick);
  }
}
