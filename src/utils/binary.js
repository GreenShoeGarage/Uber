export function toHex(bytes, separator = ' ') {
  return Array.from(bytes ?? [], b => b.toString(16).padStart(2, '0')).join(separator);
}

export function toHexCompact(bytes) {
  return toHex(bytes, '');
}

export function u32le(bytes, offset = 0) {
  if (!bytes || bytes.byteLength < offset + 4) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(offset, true);
}

export function i8(value) {
  return value > 127 ? value - 256 : value;
}

export function ascii(bytes) {
  return Array.from(bytes ?? [], b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
}

export function formatMac(bytes, reverse = true) {
  const arr = Array.from(bytes ?? []);
  if (reverse) arr.reverse();
  return arr.map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
}

export function formatHexDump(bytes, width = 16) {
  const lines = [];
  for (let i = 0; i < bytes.length; i += width) {
    const chunk = bytes.slice(i, i + width);
    const off = i.toString(16).padStart(4, '0');
    const hex = toHex(chunk).padEnd(width * 3 - 1, ' ');
    lines.push(`${off}  ${hex}  |${ascii(chunk)}|`);
  }
  return lines.join('\n');
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
