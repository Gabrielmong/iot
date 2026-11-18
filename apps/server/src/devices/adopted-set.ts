import type { Brand } from "./types.js";

/** Ids of the adopted devices each driver was last synced with; driver reports for other ids are dropped. */
export class AdoptedSet {
  private readonly byBrand = new Map<Brand, Set<string>>();

  replace(brand: Brand, ids: string[]): void {
    this.byBrand.set(brand, new Set(ids));
  }

  remove(ids: string[]): void {
    for (const set of this.byBrand.values()) for (const id of ids) set.delete(id);
  }

  has(id: string): boolean {
    for (const set of this.byBrand.values()) if (set.has(id)) return true;
    return false;
  }

  /** The brand whose driver controls `id`, or undefined when it isn't adopted. */
  brandOf(id: string): Brand | undefined {
    for (const [brand, set] of this.byBrand) if (set.has(id)) return brand;
    return undefined;
  }

  all(): Set<string> {
    return new Set([...this.byBrand.values()].flatMap((s) => [...s]));
  }
}
