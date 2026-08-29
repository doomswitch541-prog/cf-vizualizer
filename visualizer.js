const TAU = Math.PI * 2;

function averageRange(values, start, end) {
  if (!values?.length) return 0;
  const safeStart = Math.max(0, Math.min(values.length - 1, start));
  const safeEnd = Math.max(safeStart + 1, Math.min(values.length, end));
  let total = 0;
  for (let index = safeStart; index < safeEnd; index += 1) total += values[index];
  return total / (safeEnd - safeStart) / 255;
}

function rmsRange(values, start, end) {
  if (!values?.length) return 0;
  const safeStart = Math.max(0, Math.min(values.length - 1, start));
  const safeEnd = Math.max(safeStart + 1, Math.min(values.length, end));
  let total = 0;
  for (let index = safeStart; index < safeEnd; index += 1) {
    const value = values[index] / 255;
    total += value * value;
  }
  return Math.sqrt(total / (safeEnd - safeStart));
}

function peakRange(values, start, end) {
  if (!values?.length) return 0;
  const safeStart = Math.max(0, Math.min(values.length - 1, start));
  const safeEnd = Math.max(safeStart + 1, Math.min(values.length, end));
  let peak = 0;
  for (let index = safeStart; index < safeEnd; index += 1) peak = Math.max(peak, values[index] / 255);
  return peak;
}

function bandSignal(values, start, end) {
  return averageRange(values, start, end) * 0.56
    + rmsRange(values, start, end) * 0.29
    + peakRange(values, start, end) * 0.15;
}

function normalizeBand(value, floor, ceiling, curve = 0.9) {
  const normalized = Math.max(0, Math.min(1, (value - floor) / (ceiling - floor)));
  return Math.pow(normalized, curve);
}

function shapeBand(value, exponent, gain) {
  return Math.min(1, Math.pow(Math.max(0, value), exponent) * gain);
}

function followBand(current, target, attack, release) {
  return current + (target - current) * (target > current ? attack : release);
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

function mixHex(first, second, amount) {
  const from = hexToRgb(first);
  const to = hexToRgb(second);
  const mix = Math.max(0, Math.min(1, amount));
  const channel = (start, end) => Math.round(start + (end - start) * mix).toString(16).padStart(2, "0");
  return `#${channel(from.r, to.r)}${channel(from.g, to.g)}${channel(from.b, to.b)}`;
}

function colorAt(colors, position) {
  const safeColors = colors.length ? colors : ["#ffffff"];
  const wrapped = ((position % 1) + 1) % 1;
  const scaled = wrapped * safeColors.length;
  const index = Math.floor(scaled) % safeColors.length;
  const amount = scaled - Math.floor(scaled);
  const eased = amount * amount * (3 - 2 * amount);
  return mixHex(safeColors[index], safeColors[(index + 1) % safeColors.length], eased);
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
      highlight: "#d7d0c8",
      colors: ["#08090b", "#18181d", "#2a2a42", "#42362a", "#967e66", "#7e96d2", "#d7d0c8"]
    };
    this.trackIndex = 0;
    this.trackCount = 7;
    this.bass = 0;
    this.mids = 0;
    this.treble = 0;
    this.visualBass = 0;
    this.visualMids = 0;
    this.visualTreble = 0;
    this.rawEnergy = 0;
    this.intensity = 1.72;
    this.audioEnergy = 0;
    this.audioFlux = 0;
    this.bandMotion = 0;
    this.previousTargetEnergy = 0;
    this.previousBandTargets = [0, 0, 0];
    this.bandBaselines = [0, 0, 0];
    this.bandBaselinesReady = false;
    this.fastEnergy = 0;
    this.slowEnergy = 0;
    this.palettePhase = 0;
    this.paletteTravel = 0;
    this.paletteVelocity = 0;
    this.isPlaying = false;
    this.cornerSweep = null;
    this.cornerSweepCount = 0;
    this.cornerDropCount = 0;
    this.cornerAccentCount = 0;
    this.lastCornerSweepAt = -Infinity;
    this.nextCornerSweepAt = performance.now() + 6800;
    this.lastAudioFrame = performance.now();
    this.randomState = 0x51f15e;
    this.nodePulseOrder = [];
    this.nodePulseCursor = 0;
    this.nodePulses = [];
    this.nodePulseCount = 0;
    this.nodePulseSeenMask = 0;
    this.nextNodePulseAt = 0;
    this.lastNodePulseAt = -Infinity;
    this.frame = 0;
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.frequencyData = null;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(stage);
    this.resize();
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  async connect() {
    if (!this.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      const audioContext = new AudioContext();

      try {
        if (audioContext.state === "suspended") await audioContext.resume();
        const source = audioContext.createMediaElementSource(this.audio);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.58;
        analyser.minDecibels = -100;
        analyser.maxDecibels = -6;
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        this.audioContext = audioContext;
        this.source = source;
        this.analyser = analyser;
        this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
      } catch (error) {
        await audioContext.close().catch(() => {});
        throw error;
      }
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
    this.bandBaselinesReady = false;
    if (this.nodePulseOrder.length !== count) this.resetNodePulseOrder();
  }

  setIntensity(value) {
    this.intensity = Math.max(0.8, Math.min(2, Number(value) || 1));
  }

  getPaletteColors() {
    const colors = Array.isArray(this.palette.colors)
      ? this.palette.colors.filter((color) => /^#[0-9a-f]{3,8}$/i.test(String(color)))
      : [];
    return colors.length >= 3
      ? colors
      : [this.palette.background, this.palette.surface, this.palette.primary, this.palette.secondary, this.palette.accent, this.palette.highlight];
  }

  nextRandom() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  resetNodePulseOrder() {
    this.nodePulseOrder = Array.from({ length: this.trackCount }, (_, index) => index);
    for (let index = this.nodePulseOrder.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.nextRandom() * (index + 1));
      [this.nodePulseOrder[index], this.nodePulseOrder[swapIndex]] = [this.nodePulseOrder[swapIndex], this.nodePulseOrder[index]];
    }
    this.nodePulseCursor = 0;
    this.nodePulses = Array.from({ length: this.trackCount }, () => null);
  }

  triggerNodePulse(time) {
    if (this.nodePulseOrder.length !== this.trackCount || this.nodePulseCursor >= this.nodePulseOrder.length) {
      this.resetNodePulseOrder();
    }
    const index = this.nodePulseOrder[this.nodePulseCursor];
    this.nodePulseCursor += 1;
    const band = index % 3;
    const bandEnergy = [this.visualBass, this.visualMids, this.visualTreble][band];
    const bandOffset = [0.02, 0.36, 0.69][band];
    this.nodePulses[index] = {
      startedAt: time,
      duration: 480 + bandEnergy * 420 + this.nextRandom() * 240,
      strength: 0.48 + Math.min(1, bandEnergy) * 0.64 + this.audioFlux * 0.9,
      colorPosition: this.palettePhase + bandOffset + (this.nextRandom() - 0.5) * 0.08
    };
    this.nodePulseCount += 1;
    this.nodePulseSeenMask |= 1 << index;
    this.stage.dataset.nodePulseCount = String(this.nodePulseCount);
    this.stage.dataset.nodePulseSeen = String(this.nodePulseSeenMask);
    this.lastNodePulseAt = time;
    const interval = 1750 + this.nextRandom() * 1250 - this.audioEnergy * 720;
    this.nextNodePulseAt = time + Math.max(820, interval);
  }

  updateNodePulses(time) {
    const playing = !this.audio.paused && !this.audio.ended;
    if (!playing) return;
    if (!this.nodePulseOrder.length) this.resetNodePulseOrder();
    if (!this.nextNodePulseAt) this.nextNodePulseAt = time + 420;
    const onset = this.audioFlux > 0.032 && time - this.lastNodePulseAt > 760;
    const sustainedAccent = time >= this.nextNodePulseAt
      && this.audioEnergy > 0.14
      && (this.bandMotion > 0.006 || this.audioFlux > 0.012);
    if (onset || sustainedAccent) this.triggerNodePulse(time);
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

  triggerCornerSweep(time, reason, strength) {
    const safeStrength = Math.max(0.45, Math.min(1, strength));
    this.cornerSweep = {
      startedAt: time,
      duration: 1320 - safeStrength * 220,
      strength: safeStrength,
      reason
    };
    this.cornerSweepCount += 1;
    if (reason === "drop") this.cornerDropCount += 1;
    else this.cornerAccentCount += 1;
    this.lastCornerSweepAt = time;
    this.nextCornerSweepAt = time + 11000 + this.nextRandom() * 6500;
    this.stage.dataset.cornerSweepCount = String(this.cornerSweepCount);
    this.stage.dataset.cornerDropCount = String(this.cornerDropCount);
    this.stage.dataset.cornerAccentCount = String(this.cornerAccentCount);
    this.stage.dataset.cornerSweepReason = reason;
  }

  updateCornerSweep(time) {
    let rotation = 0;
    let flare = 0;

    if (this.cornerSweep) {
      const progress = (time - this.cornerSweep.startedAt) / this.cornerSweep.duration;
      if (progress >= 1) {
        this.cornerSweep = null;
        this.stage.dataset.cornerSweepReason = "idle";
      } else if (progress >= 0) {
        const eased = 1 - Math.pow(1 - progress, 3);
        rotation = this.reducedMotion ? 0 : eased * 360;
        flare = Math.pow(Math.sin(progress * Math.PI), 1.35) * this.cornerSweep.strength;
      }
    }

    this.stage.style.setProperty("--corner-turn", `${rotation.toFixed(2)}deg`);
    this.stage.style.setProperty("--corner-flare", flare.toFixed(3));
    this.stage.style.setProperty("--corner-grow", `${(flare * 7).toFixed(2)}px`);
    this.stage.style.setProperty("--corner-glow", `${(flare * 9).toFixed(2)}px`);
    this.stage.style.setProperty("--corner-scale", (1 + flare * 0.018).toFixed(4));
    this.stage.style.setProperty("--corner-opacity", (0.82 + flare * 0.18).toFixed(3));
    this.stage.style.setProperty("--corner-width", `${(1.6 + flare * 1.35).toFixed(2)}px`);
    this.stage.style.setProperty("--corner-color", colorAt(this.getPaletteColors(), this.palettePhase + 0.64));
  }

  readAudio(time) {
    const playing = !this.audio.paused && !this.audio.ended;
    this.isPlaying = playing;
    let targetBass = 0;
    let targetMids = 0;
    let targetTreble = 0;

    if (playing && this.analyser && this.frequencyData) {
      this.analyser.getByteFrequencyData(this.frequencyData);
      const intensityGain = 1 + Math.max(0, this.intensity - 1) * 0.08;
      targetBass = Math.min(1, normalizeBand(bandSignal(this.frequencyData, 1, 6), 0.28, 0.98, 1.1) * intensityGain);
      targetMids = Math.min(1, normalizeBand(bandSignal(this.frequencyData, 6, 31), 0.16, 0.88, 1.08) * intensityGain);
      targetTreble = Math.min(1, normalizeBand(bandSignal(this.frequencyData, 31, 106), 0.07, 0.78, 1.02) * intensityGain);
    }

    const targetEnergy = targetBass * 0.46 + targetMids * 0.34 + targetTreble * 0.2;
    const positiveBandFlux = Math.max(0, targetBass - this.previousBandTargets[0]) * 0.46
      + Math.max(0, targetMids - this.previousBandTargets[1]) * 0.34
      + Math.max(0, targetTreble - this.previousBandTargets[2]) * 0.2;
    const targetFlux = Math.max(0, targetEnergy - this.previousTargetEnergy) + positiveBandFlux * 0.72;
    this.bandMotion = Math.abs(targetBass - this.previousBandTargets[0]) * 0.46
      + Math.abs(targetMids - this.previousBandTargets[1]) * 0.34
      + Math.abs(targetTreble - this.previousBandTargets[2]) * 0.2;
    this.previousTargetEnergy = targetEnergy;
    this.previousBandTargets = [targetBass, targetMids, targetTreble];
    this.audioFlux += (targetFlux - this.audioFlux) * 0.44;
    this.fastEnergy += (targetEnergy - this.fastEnergy) * 0.32;
    this.slowEnergy += (targetEnergy - this.slowEnergy) * 0.028;

    let responsiveBass = 0;
    let responsiveMids = 0;
    let responsiveTreble = 0;
    if (playing) {
      if (!this.bandBaselinesReady && targetEnergy > 0.02) {
        this.bandBaselines = [targetBass, targetMids, targetTreble];
        this.bandBaselinesReady = true;
      }
      responsiveBass = Math.min(1, targetBass * 0.74 + Math.max(0, targetBass - this.bandBaselines[0]) * 1.9);
      responsiveMids = Math.min(1, targetMids * 0.74 + Math.max(0, targetMids - this.bandBaselines[1]) * 1.7);
      responsiveTreble = Math.min(1, targetTreble * 0.72 + Math.max(0, targetTreble - this.bandBaselines[2]) * 1.5);
      this.bandBaselines = [
        followBand(this.bandBaselines[0], targetBass, 0.012, 0.02),
        followBand(this.bandBaselines[1], targetMids, 0.012, 0.02),
        followBand(this.bandBaselines[2], targetTreble, 0.014, 0.024)
      ];
    }
    this.bass = followBand(this.bass, responsiveBass, 0.36, 0.13);
    this.mids = followBand(this.mids, responsiveMids, 0.34, 0.145);
    this.treble = followBand(this.treble, responsiveTreble, 0.42, 0.18);

    const rawBass = Math.min(1, this.bass);
    const rawMids = Math.min(1, this.mids);
    const rawTreble = Math.min(1, this.treble);
    const visualBass = shapeBand(rawBass, 0.9, 1);
    const visualMids = shapeBand(rawMids, 0.88, 1);
    const visualTreble = shapeBand(rawTreble, 0.86, 1);
    this.visualBass = visualBass;
    this.visualMids = visualMids;
    this.visualTreble = visualTreble;
    this.rawEnergy = rawBass * 0.46 + rawMids * 0.34 + rawTreble * 0.2;
    this.audioEnergy = visualBass * 0.46 + visualMids * 0.34 + visualTreble * 0.2;
    const elapsed = Math.min(0.08, Math.max(0, (time - this.lastAudioFrame) / 1000));
    this.lastAudioFrame = time;
    const dropContrast = this.slowEnergy > 0.035
      ? Math.max(0, (this.slowEnergy - this.fastEnergy) / this.slowEnergy)
      : 0;
    const dropReady = playing
      && dropContrast > 0.085
      && time - this.lastCornerSweepAt > 5200;
    const accentReady = playing
      && time >= this.nextCornerSweepAt
      && (this.audioFlux > 0.006 || this.audioEnergy > 0.13);
    if (dropReady) this.triggerCornerSweep(time, "drop", 0.58 + dropContrast * 0.7);
    else if (accentReady) this.triggerCornerSweep(time, "accent", 0.58 + this.audioEnergy * 0.45);
    const targetPaletteVelocity = playing
      ? 0.008 + this.rawEnergy * 0.055 + this.bandMotion * 3.2 + this.audioFlux * 4.2
      : 0.006;
    this.paletteVelocity = followBand(this.paletteVelocity, targetPaletteVelocity, 0.34, 0.075);
    const motionScale = this.reducedMotion ? 0.3 : 1;
    this.paletteTravel += elapsed * this.paletteVelocity * motionScale;
    this.palettePhase = this.paletteTravel % 1;
    this.stage.style.setProperty("--bass", visualBass.toFixed(3));
    this.stage.style.setProperty("--mids", visualMids.toFixed(3));
    this.stage.style.setProperty("--treble", visualTreble.toFixed(3));
    this.stage.style.setProperty("--palette-phase", this.palettePhase.toFixed(4));
    this.stage.style.setProperty("--palette-travel", this.paletteTravel.toFixed(4));
    this.stage.style.setProperty("--drop-contrast", dropContrast.toFixed(3));
    this.stage.dataset.bass = visualBass.toFixed(3);
    this.stage.dataset.mids = visualMids.toFixed(3);
    this.stage.dataset.treble = visualTreble.toFixed(3);
    this.stage.dataset.audioFlux = this.audioFlux.toFixed(4);
    this.stage.dataset.paletteVelocity = this.paletteVelocity.toFixed(4);
    const progress = this.audio.duration ? this.audio.currentTime / this.audio.duration : 0;
    this.stage.style.setProperty("--progress", progress.toFixed(4));
    this.updateCornerSweep(time);

    if (this.frame % 3 === 0) {
      this.meters.bass.style.width = `${Math.max(3, visualBass * 100)}%`;
      this.meters.mids.style.width = `${Math.max(3, visualMids * 100)}%`;
      this.meters.treble.style.width = `${Math.max(3, visualTreble * 100)}%`;
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
    const breath = this.reducedMotion || this.isPlaying ? 0 : Math.sin(time * 0.00038) * 1.4;
    const bassDepth = this.visualBass * Math.min(54, smallest * 0.07);
    const midBody = this.visualMids * Math.min(34, smallest * 0.048);
    const trebleLight = Math.min(1, this.visualTreble * 1.35);

    this.drawColorField(ctx, centerX, centerY, coverRadius);
    this.drawOuterHalo(ctx, centerX, centerY, orbitRadiusX, orbitRadiusY, breath, bassDepth);
    this.drawArchiveOrbit(ctx, centerX, centerY, orbitRadiusX, orbitRadiusY, trebleLight, time);
    this.drawSpectrumBody(ctx, centerX, centerY, coverRadius, midBody);
    this.drawProgressArc(ctx, centerX, centerY, coverRadius);
    this.drawCornerSignals(ctx, trebleLight, time);
  }

  drawColorField(ctx, centerX, centerY, coverRadius) {
    const sides = 6;
    const bass = this.visualBass;
    const mids = this.visualMids;
    const treble = this.visualTreble;
    const punch = Math.min(0.04, this.audioFlux * 0.9);
    const fieldScale = Math.min(1.36, 1.12 + bass * 0.16 + mids * 0.085 + punch);
    this.stage.style.setProperty("--field-scale", fieldScale.toFixed(4));
    this.stage.style.setProperty("--field-rotation", "0");
    this.stage.dataset.fieldScale = fieldScale.toFixed(4);
    const baseRadius = coverRadius * fieldScale;
    const rotation = -Math.PI / 2;
    const vertices = [];

    for (let index = 0; index < sides; index += 1) {
      const angle = rotation + (index / sides) * TAU;
      const bin = this.frequencyData?.length
        ? this.frequencyData[Math.min(this.frequencyData.length - 1, 3 + index * 14)] / 255
        : 0;
      const band = index % 3 === 0 ? bass : index % 3 === 1 ? mids : treble;
      const radius = baseRadius + coverRadius * (
        bin * 0.055
        + band * 0.05
        + punch * 0.14
      );
      vertices.push({
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      });
    }

    const fieldRadius = coverRadius * (1.5 + bass * 0.28 + punch * 0.4);
    const highPresence = Math.max(0, this.intensity - 1) * 0.13;
    const paletteColors = this.getPaletteColors();
    const bandEnergies = [bass, mids, treble];
    const fields = paletteColors.map((_, index) => {
      const band = index % 3;
      return {
        color: colorAt(paletteColors, this.palettePhase + index / paletteColors.length),
        angle: -Math.PI / 2 + (index / paletteColors.length) * TAU,
        energy: bandEnergies[band],
        band
      };
    });

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.filter = `saturate(${1.18 + this.intensity * 0.16})`;
    fields.forEach((field) => {
      const travel = coverRadius * (0.42 + field.energy * 0.22 + punch * 0.24);
      const x = centerX + Math.cos(field.angle) * travel;
      const y = centerY + Math.sin(field.angle) * travel;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, fieldRadius);
      gradient.addColorStop(0, rgba(field.color, 0.025 + highPresence * 0.05 + field.energy * 0.12));
      gradient.addColorStop(0.38, rgba(field.color, 0.018 + highPresence * 0.025 + field.energy * 0.07));
      gradient.addColorStop(1, rgba(field.color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(centerX - fieldRadius, centerY - fieldRadius, fieldRadius * 2, fieldRadius * 2);
    });
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    vertices.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.clip();
    const membraneColor = colorAt(paletteColors, this.palettePhase + 0.11);
    ctx.fillStyle = rgba(membraneColor, 0.035 + bass * 0.035);
    ctx.fill();
    ctx.globalCompositeOperation = "screen";
    ctx.filter = `saturate(${1.22 + this.intensity * 0.14})`;

    fields.forEach((field) => {
      const travel = coverRadius * (0.28 + field.energy * 0.18 + punch * 0.2);
      const x = centerX + Math.cos(field.angle) * travel;
      const y = centerY + Math.sin(field.angle) * travel;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, fieldRadius);
      gradient.addColorStop(0, rgba(field.color, 0.07 + highPresence * 0.08 + field.energy * 0.18));
      gradient.addColorStop(0.46, rgba(field.color, 0.028 + highPresence * 0.04 + field.energy * 0.09));
      gradient.addColorStop(1, rgba(field.color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(centerX - fieldRadius, centerY - fieldRadius, fieldRadius * 2, fieldRadius * 2);
    });

    ctx.restore();

    ctx.save();
    ctx.beginPath();
    vertices.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    const outlineColor = colorAt(paletteColors, this.palettePhase + 0.58);
    const shadowColor = colorAt(paletteColors, this.palettePhase + 0.19);
    ctx.strokeStyle = rgba(outlineColor, 0.28 + mids * 0.35 + punch * 0.3);
    ctx.lineWidth = 0.9 + mids * 1.4 + punch * 1.2;
    ctx.shadowColor = rgba(shadowColor, 0.4 + bass * 0.25);
    ctx.shadowBlur = 8 + bass * 20 + punch * 12;
    ctx.stroke();
    ctx.restore();
  }

  drawOuterHalo(ctx, centerX, centerY, radiusX, radiusY, breath, bassDepth) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const paletteColors = this.getPaletteColors();
    const rings = [
      { scale: 1.03, color: colorAt(paletteColors, this.palettePhase + 0.06), alpha: 0.16, width: 1 },
      { scale: 1.13, color: colorAt(paletteColors, this.palettePhase + 0.39), alpha: 0.12, width: 1 },
      { scale: 1.25, color: colorAt(paletteColors, this.palettePhase + 0.72), alpha: 0.075, width: 0.8 }
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
      ctx.strokeStyle = rgba(ring.color, ring.alpha + this.visualBass * 0.1);
      ctx.lineWidth = ring.width;
      ctx.shadowColor = rgba(ring.color, 0.42);
      ctx.shadowBlur = 7 + this.visualBass * 14;
      ctx.stroke();
    });
    ctx.restore();
  }

  drawArchiveOrbit(ctx, centerX, centerY, radiusX, radiusY, trebleLight, time) {
    this.updateNodePulses(time);
    const paletteColors = this.getPaletteColors();
    const bandEnergies = [
      this.visualBass,
      this.visualMids,
      this.visualTreble
    ];
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
    ctx.strokeStyle = rgba(colorAt(paletteColors, this.palettePhase + 0.83), 0.105 + this.visualMids * 0.08);
    ctx.lineWidth = 0.75 + this.visualMids * 0.75;
    ctx.stroke();

    let strongestPulse = 0;
    nodes.forEach((node) => {
      const band = node.index % 3;
      const bandEnergy = bandEnergies[band];
      const pulse = this.nodePulses[node.index];
      let flare = 0;
      let colorPosition = this.palettePhase + node.index / Math.max(1, this.trackCount) + [0.02, 0.36, 0.69][band];
      if (pulse) {
        const progress = (time - pulse.startedAt) / pulse.duration;
        if (progress >= 0 && progress <= 1) {
          flare = Math.sin(progress * Math.PI) ** 2 * pulse.strength * (0.46 + bandEnergy * 0.72);
          colorPosition = pulse.colorPosition;
        } else if (progress > 1) {
          this.nodePulses[node.index] = null;
        }
      }
      strongestPulse = Math.max(strongestPulse, flare);
      const nodeColor = colorAt(paletteColors, colorPosition);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(node.x, node.y);
      ctx.strokeStyle = rgba(nodeColor, node.index === this.trackIndex ? 0.2 + flare * 0.16 : 0.05 + flare * 0.18);
      ctx.lineWidth = 0.65 + flare * 0.7;
      ctx.stroke();

      const active = node.index === this.trackIndex;
      const radius = active
        ? 5.4 + this.visualBass * 4.2 + flare * 3.2
        : 2.1 + trebleLight * 1.25 + flare * 4.6;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, TAU);
      ctx.fillStyle = rgba(nodeColor, active ? 0.92 : 0.28 + trebleLight * 0.24 + flare * 0.58);
      ctx.shadowColor = rgba(nodeColor, 0.74);
      ctx.shadowBlur = active ? 15 + this.visualBass * 18 + flare * 14 : 4 + trebleLight * 8 + flare * 22;
      ctx.fill();

      if (active || flare > 0.08) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 5 + this.visualBass * 5 + flare * 5, 0, TAU);
        ctx.strokeStyle = rgba(colorAt(paletteColors, colorPosition + 0.14), 0.16 + this.visualTreble * 0.26 + flare * 0.38);
        ctx.lineWidth = 0.75 + flare * 0.8;
        ctx.stroke();
      }
    });
    this.stage.style.setProperty("--node-pulse", Math.min(1, strongestPulse).toFixed(3));
    ctx.restore();
  }

  drawSpectrumBody(ctx, centerX, centerY, radius, midBody) {
    const points = 72;
    const rotation = 0;
    const paletteColors = this.getPaletteColors();
    const signalColors = paletteColors.length > 4 ? paletteColors.slice(2) : paletteColors;
    const spectrumColor = colorAt(signalColors, this.palettePhase + 0.38);
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.28, 0, TAU);
    ctx.strokeStyle = rgba(colorAt(signalColors, this.palettePhase + 0.72), 0.23 + this.visualBass * 0.18);
    ctx.lineWidth = 0.85 + this.visualBass * 0.75;
    ctx.stroke();
    ctx.beginPath();

    for (let index = 0; index <= points; index += 1) {
      const normalized = index / points;
      const angle = normalized * TAU;
      const bin = this.frequencyData?.length
        ? this.frequencyData[Math.min(this.frequencyData.length - 1, Math.floor(normalized * 84))] / 255
        : 0;
      const symmetry = Math.abs(Math.sin(angle * 3.5));
      const amplitude = midBody * (0.3 + bin * 0.8) + symmetry * this.visualTreble * 5;
      const currentRadius = radius * 1.28 + amplitude;
      const x = Math.cos(angle) * currentRadius;
      const y = Math.sin(angle) * currentRadius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.strokeStyle = rgba(spectrumColor, 0.38 + this.visualMids * 0.5 + this.audioFlux * 0.28);
    ctx.lineWidth = 1.15 + this.visualMids * 2 + this.audioFlux * 1.3;
    ctx.shadowColor = rgba(spectrumColor, 0.58);
    ctx.shadowBlur = 6 + this.visualTreble * 9;
    ctx.stroke();
    ctx.restore();
  }

  drawProgressArc(ctx, centerX, centerY, radius) {
    const progress = this.audio.duration ? this.audio.currentTime / this.audio.duration : 0;
    const arcRadius = radius * 1.055;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, arcRadius, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
    const progressColor = colorAt(this.getPaletteColors(), this.palettePhase + 0.7);
    ctx.strokeStyle = rgba(progressColor, 0.72);
    ctx.lineWidth = 1.5;
    ctx.shadowColor = rgba(progressColor, 0.5);
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  }

  drawCornerSignals(ctx, trebleLight, time) {
    if (trebleLight < 0.05) return;
    const padding = 28;
    const pulse = this.reducedMotion
      ? 1
      : Math.min(1, 0.5 + trebleLight * 0.28 + this.audioFlux * 2.4);
    const length = 13 + trebleLight * 10;
    const corners = [
      [padding, padding, 1, 1],
      [this.width - padding, padding, -1, 1],
      [this.width - padding, this.height - padding, -1, -1],
      [padding, this.height - padding, 1, -1]
    ];
    ctx.save();
    const trebleColor = colorAt(this.getPaletteColors(), this.palettePhase + 0.68);
    ctx.strokeStyle = rgba(trebleColor, Math.min(0.5, trebleLight * 0.4) * pulse);
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
