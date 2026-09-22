// Short-lived, bounded single-flight cache. Callers must authorize before lookup.
export class ReadCache<T> {
  private readonly entries = new Map<
    string,
    { expiresAt: number; value: Promise<T> }
  >();
  clear() {
    this.entries.clear();
  }
  get(key: string, read: (isCurrent: () => boolean) => Promise<T>): Promise<T> {
    const now = Date.now();
    for (const [k, entry] of this.entries)
      if (entry.expiresAt <= now) this.entries.delete(k);
    const existing = this.entries.get(key);
    if (existing) return existing.value;
    if (this.entries.size >= 32)
      this.entries.delete(this.entries.keys().next().value!);
    const value = Promise.resolve().then(() => read(isCurrent));
    // A slow query remains single-flight. TTL starts after completion, not at query start.
    const entry = { expiresAt: Infinity, value };
    const isCurrent = () => this.entries.get(key) === entry;
    this.entries.set(key, entry);
    void value.then(
      () => {
        if (isCurrent()) entry.expiresAt = Date.now() + 2000;
      },
      () => {
        if (isCurrent()) this.entries.delete(key);
      },
    );
    return value;
  }
}
