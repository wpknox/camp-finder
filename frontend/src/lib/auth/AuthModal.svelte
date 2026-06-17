<script lang="ts">
  import { auth } from "./authStore";

  let { onclose, onsuccess }: { onclose?: () => void; onsuccess?: () => void } = $props();

  // Mirror of the server-side email rule ($lib/server/auth/validate.ts).
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let mode = $state<"login" | "register">("login");
  let email = $state("");
  let name = $state("");
  let password = $state("");
  let passwordConfirm = $state("");
  let error = $state("");
  let submitting = $state(false);

  // A field's inline error only shows once the user has left it (blur) or tried
  // to submit — so we don't yell at someone mid-typing their first character.
  let touched = $state({ email: false, name: false, password: false, passwordConfirm: false });

  function touch(field: keyof typeof touched) {
    touched = { ...touched, [field]: true };
  }

  // Per-field validation messages. Empty string === valid. Login is lenient on
  // password (existing accounts predate any rule); register enforces the rules.
  const emailError = $derived(
    !email.trim() ? "Email is required." : !EMAIL_RE.test(email) ? "Enter a valid email address." : "",
  );
  const nameError = $derived(mode === "register" && !name.trim() ? "Display name is required." : "");
  const passwordError = $derived(
    !password ? "Password is required." : mode === "register" && password.length < 8 ? "Password must be at least 8 characters." : "",
  );
  const passwordConfirmError = $derived(
    mode === "register" && passwordConfirm !== password ? "Passwords do not match." : "",
  );

  const formValid = $derived(
    !emailError && !nameError && !passwordError && !passwordConfirmError,
  );

  async function submit() {
    error = "";
    // Surface every field's error at once on a submit attempt.
    touched = { email: true, name: true, password: true, passwordConfirm: true };
    if (!formValid) return;

    submitting = true;
    try {
      if (mode === "login") await auth.login(email, password);
      else await auth.register(email, name, password, passwordConfirm);
      onsuccess?.();
      onclose?.();
    } catch (e: any) {
      error = e?.message ?? "Authentication failed";
    } finally {
      submitting = false;
    }
  }

  function switchMode() {
    mode = mode === "login" ? "register" : "login";
    error = "";
    touched = { email: false, name: false, password: false, passwordConfirm: false };
  }
</script>

<div
  class="overlay"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onclose?.(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onclose?.(); }}
>
  <div class="modal" role="dialog" aria-modal="true" aria-label={mode === 'login' ? 'Sign in' : 'Create account'}>
    <span class="eyebrow">{mode === "login" ? "Welcome back" : "Join the trail"}</span>
    <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>

    <!-- A real form so pressing Enter in any field submits. -->
    <form class="auth-form" onsubmit={(e) => { e.preventDefault(); submit(); }}>
    <div class="field">
      <input
        type="email"
        bind:value={email}
        onblur={() => touch("email")}
        placeholder="Email"
        autocomplete="email"
        class:invalid={touched.email && emailError}
        aria-invalid={touched.email && !!emailError}
      />
      {#if touched.email && emailError}<p class="field-error">{emailError}</p>{/if}
    </div>

    {#if mode === "register"}
      <div class="field">
        <input
          type="text"
          bind:value={name}
          onblur={() => touch("name")}
          placeholder="Display name"
          autocomplete="name"
          class:invalid={touched.name && nameError}
          aria-invalid={touched.name && !!nameError}
        />
        {#if touched.name && nameError}<p class="field-error">{nameError}</p>{/if}
      </div>
    {/if}

    <div class="field">
      <input
        type="password"
        bind:value={password}
        onblur={() => touch("password")}
        placeholder="Password"
        autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
        class:invalid={touched.password && passwordError}
        aria-invalid={touched.password && !!passwordError}
      />
      {#if touched.password && passwordError}
        <p class="field-error">{passwordError}</p>
      {:else if mode === "register"}
        <p class="field-hint">At least 8 characters.</p>
      {/if}
    </div>

    {#if mode === "register"}
      <div class="field">
        <input
          type="password"
          bind:value={passwordConfirm}
          onblur={() => touch("passwordConfirm")}
          placeholder="Confirm password"
          autocomplete="new-password"
          class:invalid={touched.passwordConfirm && passwordConfirmError}
          aria-invalid={touched.passwordConfirm && !!passwordConfirmError}
        />
        {#if touched.passwordConfirm && passwordConfirmError}<p class="field-error">{passwordConfirmError}</p>{/if}
      </div>
    {/if}

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <button class="primary" type="submit" disabled={submitting}>
      {#if submitting}<span class="spinner" aria-hidden="true"></span>{/if}
      {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
    </button>
    </form>

    <button class="toggle" type="button" onclick={switchMode}>
      {mode === "login" ? "Need an account?" : "Already have an account?"}
      <span class="toggle-action">{mode === "login" ? "Register" : "Sign in"}</span>
    </button>
  </div>
</div>

<style>
  /* Above the reviews modal (3500) so "Sign in to write a review" → AuthModal
     stacks on top, not behind it. */
  .overlay { position: fixed; inset: 0; background: rgba(35, 28, 14, 0.5); backdrop-filter: blur(2px); z-index: 4000; display: grid; place-items: center; padding: 1rem; }
  .modal {
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
    animation: modal-in 0.32s var(--ease);
  }
  /* A pine spine down the left edge — like a field-notebook binding. */
  .modal::before {
    content: "";
    position: absolute;
    left: 0; top: 14px; bottom: 14px;
    width: 4px;
    border-radius: 4px;
    background: var(--pine);
  }
  @keyframes modal-in {
    from { opacity: 0; transform: translateY(10px) scale(0.99); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .auth-form { display: flex; flex-direction: column; gap: 0.75rem; }
  .eyebrow { margin-top: 0.1rem; }
  h2 { margin: 0 0 0.4rem; font-family: var(--font-display); font-size: 1.55rem; font-weight: 600; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; }
  input { background: var(--paper-deep); border: 1px solid var(--line-strong); border-radius: 9px; padding: 0.62rem 0.85rem; font-size: 0.95rem; width: 100%; box-sizing: border-box; color: var(--ink); transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease); }
  input::placeholder { color: var(--ink-faint); }
  input:focus { outline: none; border-color: var(--moss); box-shadow: 0 0 0 3px color-mix(in srgb, var(--moss) 28%, transparent); }
  input.invalid { border-color: var(--rust); }
  input.invalid:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--rust) 22%, transparent); }
  .field-error { color: var(--rust); font-size: 0.78rem; margin: 0; }
  .field-hint { color: var(--ink-faint); font-size: 0.78rem; margin: 0; }
  .primary { display: flex; align-items: center; justify-content: center; gap: 0.45rem; background: var(--pine); color: #f4ecd6; border: 1px solid var(--pine-deep); border-radius: 9px; padding: 0.68rem; cursor: pointer; font-size: 0.95rem; font-weight: 600; margin-top: 0.35rem; box-shadow: var(--shadow-sm); transition: background 0.15s var(--ease), transform 0.08s var(--ease); }
  .primary:hover:not(:disabled) { background: var(--pine-deep); }
  .primary:active:not(:disabled) { transform: translateY(1px); }
  .primary:disabled { opacity: 0.7; cursor: default; }
  .spinner { width: 14px; height: 14px; border: 2px solid rgba(244, 236, 214, 0.4); border-top-color: #f4ecd6; border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .toggle { background: none; border: none; color: var(--ink-soft); font-weight: 400; font-size: 0.875rem; padding: 0; cursor: pointer; align-self: flex-start; }
  .toggle-action { color: var(--pine); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
  .toggle:hover .toggle-action { color: var(--pine-deep); }
  .error { color: var(--rust); font-size: 0.85rem; margin: 0; }
</style>
