<script lang="ts">
  import { submitJson } from "$lib/api";
  import QueueSection from "./QueueSection.svelte";

  let resetEmail = $state("");
  let resetLink = $state("");
  let resetError = $state("");
  let resetBusy = $state(false);
  let resetCopied = $state(false);

  async function generateResetLink() {
    if (resetBusy) return;
    resetBusy = true;
    resetError = "";
    resetLink = "";
    resetCopied = false;
    try {
      const r = await submitJson<{ link?: string }>("/api/admin/reset-link", {
        email: resetEmail.trim(),
      });
      if (r.ok && r.data?.link) {
        resetLink = r.data.link;
      } else {
        resetError = r.error;
      }
    } finally {
      resetBusy = false;
    }
  }

  async function copyResetLink() {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink);
      resetCopied = true;
    } catch {
      resetError = "Couldn't copy — select and copy the link manually.";
    }
  }
</script>

<QueueSection title="Password reset link">
  <div class="card">
    <p class="sub">
      No email is sent in production — generate a fresh reset link here and hand it to the
      user directly. The link is valid for 30 minutes.
    </p>
    <div class="reset-form">
      <input
        type="email"
        placeholder="user@example.com"
        bind:value={resetEmail}
        onkeydown={(e) => e.key === "Enter" && generateResetLink()}
      />
      <button
        type="button"
        class="btn btn-primary"
        disabled={resetBusy || !resetEmail.trim()}
        onclick={generateResetLink}
      >
        {resetBusy ? "Generating…" : "Generate link"}
      </button>
    </div>
    {#if resetError}
      <p class="error" role="alert">{resetError}</p>
    {/if}
    {#if resetLink}
      <div class="reset-result">
        <input type="text" class="reset-link" readonly value={resetLink} />
        <button type="button" class="btn btn-secondary" onclick={copyResetLink}>
          {resetCopied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    {/if}
  </div>
</QueueSection>

<style>
  .card {
    background:
      linear-gradient(180deg, var(--paper-2), color-mix(in srgb, var(--paper-2) 86%, var(--paper)));
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    padding: 1.25rem 1.4rem;
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .sub {
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.92rem;
  }
  .reset-form,
  .reset-result {
    display: flex;
    gap: 0.6rem;
  }
  .reset-form input {
    flex: 1;
    background: var(--paper-deep);
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    padding: 0.5rem 0.7rem;
    font-size: 0.85rem;
    color: var(--ink);
    font-family: inherit;
  }
  .reset-form input:focus {
    outline: none;
    border-color: var(--moss);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--moss) 28%, transparent);
  }
  .reset-link {
    flex: 1;
    background: var(--paper-deep);
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 0.5rem 0.7rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--pine-deep);
  }
  .error {
    color: var(--rust);
    font-size: 0.85rem;
    margin: 0;
  }
  button {
    border-radius: var(--radius);
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: none;
  }
</style>
