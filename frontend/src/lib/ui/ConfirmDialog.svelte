<script lang="ts">
  import ModalShell from "./ModalShell.svelte";

  let {
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = true,
    onconfirm,
    oncancel,
  }: {
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  let cancelBtn: HTMLButtonElement | null = $state(null);
  $effect(() => { cancelBtn?.focus(); });
</script>

<ModalShell
  role="alertdialog"
  ariaLabel={message}
  width="360px"
  padding="1.5rem"
  gap="1rem"
  flat
  animate={false}
  onclose={oncancel}
>
  <p class="msg">{message}</p>
  <div class="actions">
    <button bind:this={cancelBtn} class="btn btn-secondary btn-sm" onclick={oncancel}>{cancelLabel}</button>
    <button class="btn btn-sm {danger ? 'btn-danger' : 'btn-primary'}" onclick={onconfirm}>{confirmLabel}</button>
  </div>
</ModalShell>

<style>
  .msg { margin: 0; font-size: 0.95rem; line-height: 1.5; color: var(--ink); }
  .actions { margin-top: 0; }
  .actions button { box-shadow: none; }
</style>
