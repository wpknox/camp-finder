<script lang="ts">
  import { onMount } from "svelte";
  import { auth, isLoggedIn, currentUser } from "$lib/auth/authStore";
  import AuthModal from "$lib/auth/AuthModal.svelte";
  import { PUBLIC_TB_URL } from "$env/static/public";

  let { facilityId }: { facilityId: string } = $props();

  let saved = $state(false);
  let savedRecordId: string | null = $state(null);
  let showAuth = $state(false);

  onMount(async () => {
    if (!$isLoggedIn || !$currentUser) return;
    const token = auth.getToken();
    const res = await fetch(
      `${PUBLIC_TB_URL}/api/v1/table/saved_campgrounds/list`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          where: `user_id == '${$currentUser.id}' && facility_id == '${facilityId}'`,
          limit: 1,
        }),
      },
    );
    const data = (await res.json()) as { items?: Array<{ id: string }> };
    saved = (data.items?.length ?? 0) > 0;
    savedRecordId = data.items?.[0]?.id ?? null;
  });

  async function toggle() {
    if (!$isLoggedIn) {
      showAuth = true;
      return;
    }
    const token = auth.getToken();
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    if (saved && savedRecordId) {
      await fetch(`${PUBLIC_TB_URL}/api/v1/table/saved_campgrounds/delete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ where: `id == '${savedRecordId}'` }),
      });
      saved = false;
      savedRecordId = null;
    } else {
      const rec = (await fetch(
        `${PUBLIC_TB_URL}/api/v1/table/saved_campgrounds/insert`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            values: { user_id: $currentUser!.id, facility_id: facilityId },
          }),
        },
      ).then((r) => r.json())) as { id: string };
      saved = true;
      savedRecordId = rec.id;
    }
  }
</script>

<button class="save-btn" class:saved onclick={toggle}>
  {saved ? "★ Saved" : "☆ Save"}
</button>

{#if showAuth}
  <AuthModal onclose={() => (showAuth = false)} />
{/if}

<style>
  .save-btn {
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 0.4rem 0.85rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .save-btn.saved {
    background: #fef9c3;
    border-color: #fbbf24;
  }
</style>
