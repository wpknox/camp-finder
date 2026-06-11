import { writable } from "svelte/store";
import type { Facility } from "$lib/types";

export const selectedFacility = writable<Facility | null>(null);
export const searchPending = writable(false);
export const facilities = writable<Facility[]>([]);
export const isLoading = writable(false);
