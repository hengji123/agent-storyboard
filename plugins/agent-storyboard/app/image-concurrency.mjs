export function validateGenerationSettings(value, previous = { maxConcurrency: 2, autoAdjust: false }) {
  const next = { ...previous, ...value };
  if (!Number.isInteger(next.maxConcurrency) || next.maxConcurrency < 1 || next.maxConcurrency > 8) throw Error('最高并发必须是1—8的整数');
  if (typeof next.autoAdjust !== 'boolean') throw Error('自动调节必须是布尔值');
  return { maxConcurrency: next.maxConcurrency, autoAdjust: next.autoAdjust };
}
export class ImageConcurrency {
  constructor(settings = { maxConcurrency: 2, autoAdjust: false }, now = () => Date.now()) {
    this.now = now; this.settings = validateGenerationSettings(settings); this.current = Math.min(2, this.settings.maxConcurrency); this.successes = 0; this.cooldownUntil = 0;
  }
  get limit() { return this.settings.autoAdjust ? this.current : this.settings.maxConcurrency; }
  configure(settings) {
    const oldAuto = this.settings.autoAdjust;
    this.settings = validateGenerationSettings(settings, this.settings);
    this.current = Math.min(this.current, this.settings.maxConcurrency);
    if (!oldAuto && this.settings.autoAdjust) this.current = Math.min(2, this.settings.maxConcurrency);
    this.successes = 0;
  }
  finish(error) {
    if (!this.settings.autoAdjust) return;
    if (error) {
      this.successes = 0;
      if (/429|rate.?limit|too many|限流|配额|quota|timeout|timed out|超时|503|502|overload|temporar|网络|ECONNRESET/i.test(String(error.message || error))) {
        this.current = Math.max(1, Math.floor(this.current / 2)); this.cooldownUntil = this.now() + 60000;
      }
    } else if (this.now() >= this.cooldownUntil && ++this.successes >= 3) {
      this.current = Math.min(this.settings.maxConcurrency, this.current + 1); this.successes = 0;
    }
  }
}
