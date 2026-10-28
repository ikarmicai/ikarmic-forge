/**
 * Whether the person has allowed code to be sent to a remote embedder (F12). An answer is for one destination (host and
 * model). A yes is kept in the extension's own storage, which a repository's files cannot write (RB-12); a no is kept for
 * this session only, so it neither nags on every search nor decides for good.
 */
export interface Destination {
  host: string;
  model: string;
}

export interface ConsentStore {
  get(): string[];
  set(value: string[]): PromiseLike<void> | Promise<void>;
}

export const destinationKey = (d: Destination): string => `${d.host.toLowerCase()}|${d.model}`;

export class SemanticConsent {
  private readonly declined = new Set<string>();

  constructor(
    private readonly store: ConsentStore,
    private readonly ask: (d: Destination) => Promise<boolean>
  ) {}

  private allowed(): string[] {
    const v = this.store.get();
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  }

  /** True when the person has said yes to this destination, now or earlier. */
  readonly check = async (d: Destination): Promise<boolean> => {
    const key = destinationKey(d);
    if (this.allowed().includes(key)) return true;
    if (this.declined.has(key)) return false;
    const yes = await this.ask(d);
    if (yes) await this.store.set([...this.allowed(), key]);
    else this.declined.add(key);
    return yes;
  };

  /** Forget every answer. */
  async withdraw(): Promise<void> {
    this.declined.clear();
    await this.store.set([]);
  }
}
