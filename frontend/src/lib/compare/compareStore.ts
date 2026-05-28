// frontend/src/lib/compare/compareStore.ts
import { writable } from "svelte/store";
import { browser } from "$app/environment";

const MAX = 4;

function createCompareStore() {
  const { subscribe, set, update } = writable<string[]>([]);

  return {
    subscribe,
    add(id: string) {
      update((ids) =>
        ids.includes(id) || ids.length >= MAX ? ids : [...ids, id],
      );
    },
    remove(id: string) {
      update((ids) => ids.filter((i) => i !== id));
    },
    clear() {
      set([]);
    },
    getShareUrl(ids: string[]) {
      if (!browser) return "";
      return `${globalThis.location.origin}/compare?ids=${ids.join(",")}`;
    },
  };
}

export const compareIds = createCompareStore();
