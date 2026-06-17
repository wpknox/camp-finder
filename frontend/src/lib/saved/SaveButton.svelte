<script lang="ts">
  import { onMount } from "svelte";
  import { isLoggedIn } from "$lib/auth/authStore";
  import AuthModal from "$lib/auth/AuthModal.svelte";
  import ConfirmDialog from "$lib/ui/ConfirmDialog.svelte";

  let { facilityId, facilityName = "this campground" }: { facilityId: string; facilityName?: string } = $props();

  let saved = $state(false);
  let savedRecordId: string | null = $state(null);
  let showAuth = $state(false);
  let confirmingRemove = $state(false);
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

  // Clicking the button: guests get the auth modal; if already saved, confirm
  // before removing; otherwise save immediately.
  function onClick() {
    if (!$isLoggedIn) { showAuth = true; return; }
    if (saved) { confirmingRemove = true; return; }
    void save();
  }

  async function save() {
    busy = true;
    try {
      await fetch("/api/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ facility_id: facilityId }),
      });
      // Re-read so we always hold the canonical record id (the insert response
      // shape isn't guaranteed to surface it), which keeps later removes correct.
      await refresh();
    } finally {
      busy = false;
    }
  }

  async function remove() {
    confirmingRemove = false;
    if (!savedRecordId) { await refresh(); return; }
    busy = true;
    try {
      await fetch("/api/saved", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: savedRecordId }),
      });
      saved = false;
      savedRecordId = null;
    } finally {
      busy = false;
    }
  }
</script>

<button class="save-btn" class:saved onclick={onClick} disabled={busy}>
  {saved ? "★ Saved" : "☆ Save"}
</button>

{#if showAuth}
  <AuthModal onclose={() => (showAuth = false)} onsuccess={refresh} />
{/if}

{#if confirmingRemove}
  <ConfirmDialog
    message={`Remove ${facilityName} from your saved campgrounds?`}
    confirmLabel="Remove"
    onconfirm={remove}
    oncancel={() => (confirmingRemove = false)}
  />
{/if}

<style>
  .save-btn { background: var(--paper-deep); color: var(--ink); border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 0.42rem 0.9rem; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: background 0.13s var(--ease), color 0.13s var(--ease); }
  .save-btn:hover { background: color-mix(in srgb, var(--paper-deep) 80%, var(--line-strong)); }
  .save-btn.saved { background: color-mix(in srgb, var(--ochre) 22%, var(--paper-2)); border-color: color-mix(in srgb, var(--ochre) 55%, transparent); color: #7c5a10; }
  .save-btn:disabled { opacity: 0.6; cursor: default; }
</style>
