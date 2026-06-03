<script lang="ts">
  import { onMount } from "svelte";
  import { isLoggedIn } from "$lib/auth/authStore";
  import AuthModal from "$lib/auth/AuthModal.svelte";

  let { facilityId }: { facilityId: string } = $props();

  let saved = $state(false);
  let savedRecordId: string | null = $state(null);
  let showAuth = $state(false);
  let busy = $state(false);

  async function refresh() {
    if (!$isLoggedIn) { saved = false; savedRecordId = null; return; }
    const res = await fetch(`/api/saved?facilityId=${encodeURIComponent(facilityId)}`, { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { saved: boolean; id: string | null };
    saved = data.saved;
    savedRecordId = data.id;
  }

  onMount(refresh);
  // Re-check whenever login state flips (e.g. after signing in via the modal).
  $effect(() => { void $isLoggedIn; refresh(); });

  async function toggle() {
    if (!$isLoggedIn) { showAuth = true; return; }
    busy = true;
    try {
      if (saved && savedRecordId) {
        await fetch("/api/saved", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: savedRecordId }),
        });
        saved = false; savedRecordId = null;
      } else {
        const rec = (await fetch("/api/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ facility_id: facilityId }),
        }).then((r) => r.json())) as { id?: string };
        saved = true; savedRecordId = rec.id ?? null;
      }
    } finally {
      busy = false;
    }
  }
</script>

<button class="save-btn" class:saved onclick={toggle} disabled={busy}>
  {saved ? "★ Saved" : "☆ Save"}
</button>

{#if showAuth}
  <AuthModal onclose={() => (showAuth = false)} onsuccess={refresh} />
{/if}

<style>
  .save-btn { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.4rem 0.85rem; cursor: pointer; font-size: 0.85rem; }
  .save-btn.saved { background: #fef9c3; border-color: #fbbf24; }
  .save-btn:disabled { opacity: 0.6; cursor: default; }
</style>
