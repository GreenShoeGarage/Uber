import { BLE_CHANNELS, WIFI_24_CHANNELS } from '../spectrum/spectrum.js';

export class SpectrumCanvasView {
  constructor(model, callbacks = {}) {
    this.model = model;
    this.spectrumCanvas = null;
    this.waterfallCanvas = null;
    this.cursor = null;
    this.callbacks = callbacks;
    this.geometry = null;
  }

  attach() {
    this.spectrumCanvas = document.getElementById('spectrum-canvas');
    this.waterfallCanvas = document.getElementById('waterfall-canvas');
    if (!this.spectrumCanvas || !this.waterfallCanvas) return;
    this.#bindSpectrumPointer();
    this.draw();
  }

  draw() {
    if (!this.spectrumCanvas || !this.waterfallCanvas) return;
    this.#drawSpectrum();
    this.#drawWaterfall();
    this.#updateReadouts();
  }

  #bindSpectrumPointer() {
    const canvas = this.spectrumCanvas;
    canvas.addEventListener('pointermove', event => {
      const frequency = this.#frequencyFromPointer(event);
      if (frequency === null) return;
      this.cursor = this.model.sampleAt(frequency);
      this.draw();
    });
    canvas.addEventListener('pointerleave', () => {
      this.cursor = null;
      this.draw();
    });
    canvas.addEventListener('click', event => {
      const frequency = this.#frequencyFromPointer(event);
      if (frequency === null) return;
      this.callbacks.onMarker?.(frequency);
    });
    canvas.addEventListener('dblclick', event => {
      event.preventDefault();
      this.model.resetView();
      this.callbacks.onViewChange?.(this.model.viewLow, this.model.viewHigh);
      this.draw();
    });
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      const frequency = this.#frequencyFromPointer(event) ?? (this.model.viewLow + this.model.viewHigh) / 2;
      this.model.zoom(event.deltaY < 0 ? 0.72 : 1 / 0.72, frequency);
      this.callbacks.onViewChange?.(this.model.viewLow, this.model.viewHigh);
      this.draw();
    }, { passive: false });
  }

  #frequencyFromPointer(event) {
    if (!this.geometry) return null;
    const rect = this.spectrumCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const { pad, w } = this.geometry;
    const plotW = w - pad.l - pad.r;
    if (x < pad.l || x > w - pad.r || plotW <= 0) return null;
    const ratio = (x - pad.l) / plotW;
    return this.model.viewLow + ratio * (this.model.viewHigh - this.model.viewLow);
  }

  #fit(canvas, minHeight = 160) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(minHeight, Math.floor(rect.height));
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  #colors() {
    const css = getComputedStyle(document.documentElement);
    return {
      bg: css.getPropertyValue('--plot-bg').trim() || '#071016',
      grid: css.getPropertyValue('--grid').trim() || '#20323d',
      text: css.getPropertyValue('--muted').trim() || '#85949e',
      faint: css.getPropertyValue('--faint').trim() || '#5f6e76',
      live: css.getPropertyValue('--accent').trim() || '#57e389',
      avg: css.getPropertyValue('--cyan').trim() || '#62d7ff',
      peak: css.getPropertyValue('--amber').trim() || '#f6c177',
      marker: css.getPropertyValue('--danger').trim() || '#ff6b6b',
      panel: css.getPropertyValue('--panel').trim() || '#10171c',
      textStrong: css.getPropertyValue('--text').trim() || '#e7eef2'
    };
  }

  #drawSpectrum() {
    const { ctx, w, h } = this.#fit(this.spectrumCanvas, 220);
    const c = this.#colors();
    const pad = { l: 58, r: 18, t: 26, b: 42 };
    this.geometry = { w, h, pad };
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);
    this.#drawGrid(ctx, w, h, pad, c);
    this.#drawOverlays(ctx, w, h, pad, c, false);
    this.#trace(ctx, this.model.persistence, c.faint, w, h, pad, 1.1, [4, 4]);
    if (this.model.peakHold) this.#trace(ctx, this.model.peak, c.peak, w, h, pad, 1.1);
    this.#trace(ctx, this.model.average, c.avg, w, h, pad, 1.25);
    this.#trace(ctx, this.model.latest, c.live, w, h, pad, 1.85);
    this.#drawUserMarkers(ctx, w, h, pad, c);
    this.#drawCursor(ctx, w, h, pad, c);
  }

  #drawGrid(ctx, w, h, pad, c) {
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = c.text;
    ctx.font = '10px ui-monospace, monospace';

    const rssiSpan = this.model.rssiMax - this.model.rssiMin;
    const rssiStep = niceStep(rssiSpan / 5, [5, 10, 20, 25, 40]);
    const firstDb = Math.ceil(this.model.rssiMin / rssiStep) * rssiStep;
    for (let db = firstDb; db <= this.model.rssiMax; db += rssiStep) {
      const y = pad.t + plotH * (1 - (db - this.model.rssiMin) / rssiSpan);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(`${db}`, 7, y + 3);
    }
    ctx.fillText('RAW RSSI', 7, pad.t - 8);

    const span = Math.max(1, this.model.viewHigh - this.model.viewLow);
    const freqStep = niceFrequencyStep(span, plotW);
    const firstFreq = Math.ceil(this.model.viewLow / freqStep) * freqStep;
    for (let f = firstFreq; f <= this.model.viewHigh + 0.0001; f += freqStep) {
      const x = this.#xForFrequency(f, w, pad);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
      ctx.fillText(formatFrequency(f), x - 14, h - 23);
    }
    ctx.fillText('MHz', w - 42, h - 8);

    ctx.fillStyle = c.faint;
    ctx.fillText(`VIEW ${formatRange(this.model.viewLow, this.model.viewHigh)} MHz`, pad.l, 14);
    if (this.model.viewLow !== this.model.low || this.model.viewHigh !== this.model.high) {
      ctx.fillText('WHEEL TO ZOOM • DOUBLE-CLICK TO RESET', Math.max(pad.l, w - 285), 14);
    }
  }

  #drawOverlays(ctx, w, h, pad, c, waterfall) {
    const top = pad.t;
    const bottom = h - pad.b;
    if (this.model.showBleOverlay) {
      for (const ch of BLE_CHANNELS) {
        if (!this.#inView(ch.frequency)) continue;
        const x = this.#xForFrequency(ch.frequency, w, pad);
        ctx.save();
        if (ch.advertising) {
          ctx.strokeStyle = c.marker;
          ctx.globalAlpha = waterfall ? 0.52 : 0.72;
          ctx.setLineDash([3, 5]);
          ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = c.marker;
          ctx.globalAlpha = 0.9;
          ctx.font = '9px ui-monospace, monospace';
          ctx.fillText(`BLE${ch.channel}`, x + 3, top + 11);
        } else if (!waterfall) {
          ctx.strokeStyle = c.avg;
          ctx.globalAlpha = 0.34;
          ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + 7); ctx.stroke();
          if ((this.model.viewHigh - this.model.viewLow) <= 45) {
            ctx.fillStyle = c.avg;
            ctx.globalAlpha = 0.55;
            ctx.font = '7px ui-monospace, monospace';
            ctx.fillText(String(ch.channel), x - 3, top + 18);
          }
        }
        ctx.restore();
      }
    }

    if (this.model.showWifiOverlay) {
      for (const ch of WIFI_24_CHANNELS) {
        if (!this.#inView(ch.frequency)) continue;
        const x = this.#xForFrequency(ch.frequency, w, pad);
        const major = [1, 6, 11, 14].includes(ch.channel);
        ctx.save();
        ctx.strokeStyle = c.peak;
        ctx.globalAlpha = waterfall ? (major ? 0.3 : 0.12) : (major ? 0.5 : 0.22);
        if (major) ctx.setLineDash([2, 6]);
        ctx.beginPath();
        if (waterfall || major) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
        else { ctx.moveTo(x, bottom - 7); ctx.lineTo(x, bottom); }
        ctx.stroke();
        ctx.setLineDash([]);
        if (!waterfall && (major || (this.model.viewHigh - this.model.viewLow) <= 55)) {
          ctx.fillStyle = c.peak;
          ctx.globalAlpha = major ? 0.78 : 0.46;
          ctx.font = '8px ui-monospace, monospace';
          ctx.fillText(`W${ch.channel}`, x + 2, bottom - 4);
        }
        ctx.restore();
      }
    }
  }

  #trace(ctx, data, color, w, h, pad, width = 1, dash = []) {
    if (!data?.length) return;
    const startFreq = Math.max(this.model.low, Math.floor(this.model.viewLow));
    const endFreq = Math.min(this.model.high, Math.ceil(this.model.viewHigh));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    let started = false;
    for (let f = startFreq; f <= endFreq; f += 1) {
      const i = f - this.model.low;
      if (!this.model.seenEver[i]) continue;
      const x = this.#xForFrequency(f, w, pad);
      const y = this.#yForRssi(data[i], h, pad);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  #drawUserMarkers(ctx, w, h, pad, c) {
    for (const marker of this.model.markers) {
      if (!this.#inView(marker.frequency)) continue;
      const x = this.#xForFrequency(marker.frequency, w, pad);
      ctx.save();
      ctx.strokeStyle = c.textStrong;
      ctx.globalAlpha = 0.72;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = c.panel;
      ctx.fillRect(x - 13, h - pad.b + 4, 27, 15);
      ctx.fillStyle = c.textStrong;
      ctx.globalAlpha = 1;
      ctx.font = 'bold 8px ui-monospace, monospace';
      ctx.fillText(marker.id, x - 9, h - pad.b + 14);
      ctx.restore();
    }
  }

  #drawCursor(ctx, w, h, pad, c) {
    if (!this.cursor || !this.#inView(this.cursor.frequency)) return;
    const x = this.#xForFrequency(this.cursor.frequency, w, pad);
    const rssi = this.cursor.latest ?? this.model.rssiMin;
    const y = this.#yForRssi(rssi, h, pad);
    ctx.save();
    ctx.strokeStyle = c.textStrong;
    ctx.globalAlpha = 0.58;
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = c.textStrong;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(x, y, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  #drawWaterfall() {
    const { ctx, w, h } = this.#fit(this.waterfallCanvas, 180);
    const rows = this.model.waterfall;
    const c = this.#colors();
    const pad = { l: 58, r: 18, t: 16, b: 30 };
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    if (rows.length) {
      const visible = rows.slice(-this.model.maxWaterfallRows);
      const rowH = plotH / Math.max(1, this.model.maxWaterfallRows);
      const lo = Math.max(0, Math.floor(this.model.viewLow) - this.model.low);
      const hi = Math.min(this.model.binCount - 1, Math.ceil(this.model.viewHigh) - this.model.low);
      const count = Math.max(1, hi - lo + 1);
      for (let r = 0; r < visible.length; r += 1) {
        const y = pad.t + plotH - (visible.length - r) * rowH;
        const values = visible[r].values ?? visible[r];
        const cellW = plotW / count;
        for (let i = lo; i <= hi; i += 1) {
          ctx.fillStyle = heat(values[i], this.model.rssiMin, this.model.rssiMax);
          ctx.fillRect(pad.l + (i - lo) * cellW, y, Math.ceil(cellW) + 1, Math.ceil(rowH) + 1);
        }
      }
    }
    ctx.strokeStyle = c.grid;
    ctx.strokeRect(pad.l, pad.t, plotW, plotH);
    this.#drawOverlays(ctx, w, h, pad, c, true);
    this.#drawWaterfallAxis(ctx, w, h, pad, c);
  }

  #drawWaterfallAxis(ctx, w, h, pad, c) {
    const plotW = w - pad.l - pad.r;
    const span = Math.max(1, this.model.viewHigh - this.model.viewLow);
    const freqStep = niceFrequencyStep(span, plotW);
    const firstFreq = Math.ceil(this.model.viewLow / freqStep) * freqStep;
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = c.text;
    for (let f = firstFreq; f <= this.model.viewHigh + 0.001; f += freqStep) {
      const x = this.#xForFrequency(f, w, pad);
      ctx.fillText(formatFrequency(f), x - 12, h - 11);
    }
    ctx.fillText('OLDER', 7, pad.t + 8);
    ctx.fillText('NEW', 18, h - pad.b - 2);
  }

  #xForFrequency(frequency, w, pad) {
    const span = Math.max(0.0001, this.model.viewHigh - this.model.viewLow);
    return pad.l + ((frequency - this.model.viewLow) / span) * (w - pad.l - pad.r);
  }

  #yForRssi(rssi, h, pad) {
    const bounded = Math.max(this.model.rssiMin, Math.min(this.model.rssiMax, rssi));
    const ratio = (bounded - this.model.rssiMin) / Math.max(1, this.model.rssiMax - this.model.rssiMin);
    return pad.t + (h - pad.t - pad.b) * (1 - ratio);
  }

  #inView(frequency) {
    return frequency >= this.model.viewLow && frequency <= this.model.viewHigh;
  }

  #updateReadouts() {
    const cursor = document.querySelector('[data-live="spectrum-cursor"]');
    if (cursor) {
      cursor.textContent = this.cursor
        ? `${this.cursor.frequency} MHz · LIVE ${fmtDb(this.cursor.latest)} · AVG ${fmtDb(this.cursor.average)} · PEAK ${fmtDb(this.cursor.peak)}`
        : 'MOVE OVER PLOT · CLICK TO MARK · WHEEL TO ZOOM';
    }
    const view = document.querySelector('[data-live="spectrum-view"]');
    if (view) view.textContent = `${formatRange(this.model.viewLow, this.model.viewHigh)} MHz`;
  }
}

function fmtDb(value) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : Number(value).toFixed(0);
}

function heat(db, min, max) {
  if (!Number.isFinite(db)) return 'hsl(230 20% 7%)';
  const t = Math.max(0, Math.min(1, (db - min) / Math.max(1, max - min)));
  const hue = 230 - 230 * t;
  const light = 8 + 48 * t;
  return `hsl(${hue} 90% ${light}%)`;
}

function niceFrequencyStep(span, pixels) {
  const targetTicks = Math.max(3, Math.min(10, Math.floor(pixels / 90)));
  const rough = span / targetTicks;
  const options = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
  return options.find(step => step >= rough) ?? 1000;
}

function niceStep(rough, options) {
  return options.find(step => step >= rough) ?? options.at(-1);
}

function formatFrequency(value) {
  return Math.abs(value - Math.round(value)) < 0.01 ? String(Math.round(value)) : value.toFixed(1);
}

function formatRange(low, high) {
  return `${formatFrequency(low)}–${formatFrequency(high)}`;
}
