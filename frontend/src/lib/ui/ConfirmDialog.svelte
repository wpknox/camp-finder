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
  .overlay { position: fixed; inset: 0; background: rgba(35, 28, 14, 0.5); backdrop-filter: blur(2px); z-index: 4000; display: grid; place-items: center; padding: 1rem; }
  .dialog { background: var(--paper-2); border: 1px solid var(--line-strong); border-radius: 14px; padding: 1.5rem; width: min(360px, 100%); display: flex; flex-direction: column; gap: 1rem; box-shadow: var(--shadow-lg); }
  .msg { margin: 0; font-size: 0.95rem; line-height: 1.5; color: var(--ink); }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
  .actions button { border-radius: var(--radius); padding: 0.45rem 0.95rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; border: 1px solid var(--line-strong); background: var(--paper-deep); color: var(--ink); transition: background 0.13s var(--ease); }
  .cancel:hover { background: color-mix(in srgb, var(--paper-deep) 80%, var(--line-strong)); }
  .confirm { background: var(--pine); color: #f4ecd6; border-color: var(--pine-deep); }
  .confirm:hover { background: var(--pine-deep); }
  .confirm.danger { background: var(--rust); border-color: #832e12; }
  .confirm.danger:hover { background: #832e12; }
</style>
