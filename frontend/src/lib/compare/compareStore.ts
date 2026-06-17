// frontend/src/lib/compare/compareStore.ts
import { writable } from "svelte/store";

export const MAX_COMPARE = 4;

/** The minimum we need to show a campground in the compare tray and build the
 *  /compare?ids= link. */
export type CompareItem = { id: string; name: string };

function createCompareStore() {
  const { subscribe, set, update } = writable<CompareItem[]>([]);

  return {
    subscribe,
    add(item: CompareItem) {
      update((list) =>
        list.some((c) => c.id === item.id) || list.length >= MAX_COMPARE
          ? list
          : [...list, item],
      );
    },
    remove(id: string) {
      update((list) => list.filter((c) => c.id !== id));
    },
    clear() {
      set([]);
    },
  };
}

export const compareList = createCompareStore();
