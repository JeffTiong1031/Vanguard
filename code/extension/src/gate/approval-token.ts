export class ApprovalStore {
  private hash: string | null = null;
  private expiresAt = 0;
  approve(rewrittenHash: string, ttlMs: number): void {
    this.hash = rewrittenHash;
    this.expiresAt = Date.now() + ttlMs;
  }
  private live(): boolean {
    if (this.hash && Date.now() > this.expiresAt) this.hash = null;
    return this.hash != null;
  }
  currentHash(): string | null { return this.live() ? this.hash : null; }
  consumeIfMatch(hash: string): boolean {
    if (!this.live() || this.hash !== hash) return false;
    this.hash = null; // burn: single-use
    return true;
  }
  invalidate(): void { this.hash = null; } // called on any composer edit
}
