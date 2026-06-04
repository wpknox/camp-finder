<script lang="ts">
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

<div
  class="overlay"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) oncancel(); }}
  onkeydown={(e) => { if (e.key === 'Escape') oncancel(); }}
>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-label={message}>
    <p class="msg">{message}</p>
    <div class="actions">
      <button bind:this={cancelBtn} class="cancel" onclick={oncancel}>{cancelLabel}</button>
      <button class="confirm" class:danger onclick={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 4000; display: grid; place-items: center; padding: 1rem; }
  .dialog { background: white; border-radius: 12px; padding: 1.5rem; width: min(360px, 100%); display: flex; flex-direction: column; gap: 1rem; }
  .msg { margin: 0; font-size: 0.95rem; color: #111827; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .actions button { border-radius: 8px; padding: 0.45rem 0.9rem; font-size: 0.875rem; cursor: pointer; border: 1px solid #d1d5db; background: white; }
  .cancel { color: #374151; }
  .confirm { background: #2563eb; color: white; border-color: #2563eb; font-weight: 600; }
  .confirm.danger { background: #dc2626; border-color: #dc2626; }
</style>
