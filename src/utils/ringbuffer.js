export class RingBuffer {
  constructor(capacity = 20000) {
    this.capacity = Math.max(1, capacity);
    this.buffer = new Array(this.capacity);
    this.start = 0;
    this.length = 0;
    this.totalPushed = 0;
    this.dropped = 0;
  }

  push(value) {
    const index = (this.start + this.length) % this.capacity;
    if (this.length < this.capacity) {
      this.buffer[index] = value;
      this.length += 1;
    } else {
      this.buffer[this.start] = value;
      this.start = (this.start + 1) % this.capacity;
      this.dropped += 1;
    }
    this.totalPushed += 1;
  }

  clear() {
    this.buffer = new Array(this.capacity);
    this.start = 0;
    this.length = 0;
    this.totalPushed = 0;
    this.dropped = 0;
  }

  at(index) {
    if (index < 0 || index >= this.length) return undefined;
    return this.buffer[(this.start + index) % this.capacity];
  }

  toArray() {
    const out = new Array(this.length);
    for (let i = 0; i < this.length; i += 1) out[i] = this.at(i);
    return out;
  }

  newest(count = this.length) {
    const n = Math.min(count, this.length);
    const out = new Array(n);
    for (let i = 0; i < n; i += 1) out[i] = this.at(this.length - n + i);
    return out;
  }
}
