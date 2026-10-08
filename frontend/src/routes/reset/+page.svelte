<script lang="ts">
  import { submitJson } from "$lib/api";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";

  const token = $derived(page.url.searchParams.get("token") ?? "");

  let password = $state("");
  let passwordConfirm = $state("");
  let touched = $state({ password: false, passwordConfirm: false });
  let submitting = $state(false);
  let done = $state(false);
  let error = $state("");

  const passwordError = $derived(
    !password ? "Password is required." : password.length < 8 ? "Password must be at least 8 characters." : "",
  );
  const passwordConfirmError = $derived(
    passwordConfirm !== password ? "Passwords do not match." : "",
  );
  const formValid = $derived(!passwordError && !passwordConfirmError);

  function touch(field: keyof typeof touched) {
    touched = { ...touched, [field]: true };
  }

  async function submit() {
    error = "";
    touched = { password: true, passwordConfirm: true };
    if (!formValid) return;
    submitting = true;
    try {
      const r = await submitJson("/api/auth/reset", { token, password, passwordConfirm }, { fallbackError: "Something went wrong." });
      if (r.ok) done = true;
      else error = r.error;
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head><title>Reset password — CampFinder</title></svelte:head>

<div class="reset-page">
  <div class="card form-roomy">
    {#if done}
      <span class="eyebrow">All set</span>
      <h1>Password updated</h1>
      <p class="copy">Password updated. Sign in with your new password from the map page.</p>
      <button class="btn btn-primary" type="button" onclick={() => goto("/")}>Back to the map</button>
    {:else if !token}
      <span class="eyebrow">Reset password</span>
      <h1>Link is missing its token</h1>
      <p class="copy">
        This reset link is missing its token. Use the "Forgot password?" link on the sign-in
        form to request a new one.
      </p>
      <a class="link" href="/">Back to the map</a>
    {:else}
      <span class="eyebrow">Reset password</span>
      <h1>Set a new password</h1>

      <form class="form form-roomy" onsubmit={(e) => { e.preventDefault(); submit(); }}>
        <div class="field">
          <input
            type="password"
            bind:value={password}
            onblur={() => touch("password")}
            placeholder="New password"
            autocomplete="new-password"
            class:invalid={touched.password && passwordError}
            aria-invalid={touched.password && !!passwordError}
          />
          {#if touched.password && passwordError}
            <p class="field-error">{passwordError}</p>
          {:else}
            <p class="field-hint">At least 8 characters.</p>
          {/if}
        </div>

        <div class="field">
          <input
            type="password"
            bind:value={passwordConfirm}
            onblur={() => touch("passwordConfirm")}
            placeholder="Confirm new password"
            autocomplete="new-password"
            class:invalid={touched.passwordConfirm && passwordConfirmError}
            aria-invalid={touched.passwordConfirm && !!passwordConfirmError}
          />
          {#if touched.passwordConfirm && passwordConfirmError}
            <p class="field-error">{passwordConfirmError}</p>
          {/if}
        </div>

        {#if error}
          <p class="error" role="alert">
            {error}
            <a class="link" href="/">Request a new link</a>
          </p>
        {/if}

        <button class="btn btn-primary" type="submit" disabled={submitting}>
          {#if submitting}<span class="spinner" aria-hidden="true"></span>{/if}
          {submitting ? "Please wait…" : "Set new password"}
        </button>
      </form>
    {/if}
  </div>
</div>

<style>
  .reset-page {
    /* .app-shell is a flex row; without flex:1 this page shrinks to its
       content width and sits at the left edge. */
    flex: 1;
    display: grid;
    place-items: center;
    background: var(--paper);
    padding: 1.5rem;
    box-sizing: border-box;
  }
  .card {
    position: relative;
    background:
      linear-gradient(180deg, var(--paper-2), color-mix(in srgb, var(--paper-2) 86%, var(--paper)));
    border: 1px solid var(--line-strong);
    border-radius: 14px;
    padding: 1.9rem;
    width: min(390px, 100%);
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    box-shadow: var(--shadow-lg);
  }
  /* A pine spine down the left edge — like a field-notebook binding. */
  .card::before {
    content: "";
    position: absolute;
    left: 0; top: 14px; bottom: 14px;
    width: 4px;
    border-radius: 4px;
    background: var(--pine);
  }
  .eyebrow { margin-top: 0.1rem; }
  h1 { margin: 0 0 0.4rem; font-family: var(--font-display); font-size: 1.55rem; font-weight: 600; }
  .copy { margin: 0; color: var(--ink-soft); font-size: 0.9rem; line-height: 1.5; }
  .error { display: flex; flex-direction: column; gap: 0.3rem; }
  .link { font-size: 0.85rem; font-weight: 600; color: var(--pine); }
  .link:hover { color: var(--pine-deep); }
</style>
