<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { auth, currentUser } from "./authStore";

  const DISMISS_KEY = "cf-verify-dismissed";

  let dismissed = $state(browser ? sessionStorage.getItem(DISMISS_KEY) === "1" : false);
  let resendState: "idle" | "sending" | "sent" | "error" = $state("idle");
  let resendError = $state("");

  let verifiedParam = $derived(page.url.searchParams.get("verified"));

  // "success" / "failure" come from the emailed link redirect; "nag" is the
  // default unverified-signed-in reminder.
  let kind: "success" | "failure" | "nag" = $derived(
    verifiedParam === "1" ? "success" : verifiedParam === "0" ? "failure" : "nag",
  );

  let visible = $derived(
    !dismissed &&
      (kind !== "nag" || ($currentUser != null && $currentUser.email_verified !== true)),
  );

  function dismiss() {
    dismissed = true;
    if (browser) sessionStorage.setItem(DISMISS_KEY, "1");
  }

  async function resend() {
    resendState = "sending";
    const result = await auth.requestVerify();
    if (result.ok) {
      resendState = "sent";
    } else {
      resendState = "error";
      resendError = result.error ?? "Could not send email. Try again later.";
    }
  }
</script>

{#if visible}
  <div class="verify-banner" class:success={kind === "success"}>
    <div class="content">
      <span class="eyebrow mono">Account</span>
      {#if resendState === "sent"}
        <span class="message">Sent — check your inbox.</span>
      {:else if resendState === "error"}
        <span class="message">{resendError}</span>
      {:else if kind === "success"}
        <span class="message">Email verified — you're all set.</span>
      {:else if kind === "failure"}
        <span class="message">That verification link didn't work — request a new one.</span>
      {:else}
        <span class="message">Verify your email — check your inbox for the link.</span>
      {/if}
      {#if kind !== "success" && resendState !== "sent"}
        <button class="resend" onclick={resend} disabled={resendState === "sending"}>
          {resendState === "sending" ? "Sending…" : "Resend email"}
        </button>
      {/if}
    </div>
    <button class="dismiss" onclick={dismiss} aria-label="Dismiss">✕</button>
  </div>
{/if}

<style>
  .verify-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.55rem 1rem;
    background: var(--paper-2);
    border-bottom: 1px solid var(--line);
    border-left: 3px solid var(--rust);
    box-shadow: var(--shadow-sm);
  }
  .verify-banner.success {
    border-left-color: var(--moss);
  }
  .content {
    display: flex;
    align-items: baseline;
    gap: 0.65rem;
    flex-wrap: wrap;
  }
  .eyebrow {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .message {
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .resend {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--pine);
    transition: color 0.13s var(--ease);
  }
  .resend:hover:not(:disabled) {
    color: var(--pine-deep);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .resend:disabled {
    color: var(--ink-faint);
    cursor: default;
  }
  .dismiss {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    color: var(--ink-faint);
    padding: 0.15rem 0.3rem;
    flex-shrink: 0;
    transition: color 0.13s var(--ease);
  }
  .dismiss:hover {
    color: var(--ink);
  }
</style>
