// Job id generator: T + zero-padded counter (architecture §4 naming).
export class JobIdGenerator {
  private n: number;
  constructor(start = 0) {
    this.n = start;
  }
  next(): string {
    this.n += 1;
    return "T" + String(this.n).padStart(3, "0");
  }
}
