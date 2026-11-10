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

  all(): Set<string> {
    return new Set([...this.byBrand.values()].flatMap((s) => [...s]));
  }
}
