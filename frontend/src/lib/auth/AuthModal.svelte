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
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 3000; display: grid; place-items: center; padding: 1rem; }
  .modal { background: white; border-radius: 12px; padding: 2rem; width: min(380px, 100%); display: flex; flex-direction: column; gap: 0.75rem; }
  .auth-form { display: flex; flex-direction: column; gap: 0.75rem; }
  h2 { margin: 0; font-size: 1.1rem; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; }
  input { border: 1px solid #d1d5db; border-radius: 8px; padding: 0.6rem 0.85rem; font-size: 0.95rem; width: 100%; box-sizing: border-box; }
  input:focus { outline: none; border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15); }
  input.invalid { border-color: #dc2626; }
  input.invalid:focus { box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15); }
  .field-error { color: #dc2626; font-size: 0.78rem; margin: 0; }
  .field-hint { color: #9ca3af; font-size: 0.78rem; margin: 0; }
  .primary { display: flex; align-items: center; justify-content: center; gap: 0.45rem; background: #16a34a; color: white; border: none; border-radius: 8px; padding: 0.65rem; cursor: pointer; font-size: 0.95rem; font-weight: 600; margin-top: 0.25rem; }
  .primary:disabled { opacity: 0.7; cursor: default; }
  .spinner { width: 14px; height: 14px; border: 2px solid rgba(255, 255, 255, 0.45); border-top-color: white; border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .toggle { background: none; border: none; color: #6b7280; font-weight: 400; font-size: 0.875rem; padding: 0; cursor: pointer; }
  .toggle-action { color: #16a34a; font-weight: 600; text-decoration: underline; }
  .toggle:hover .toggle-action { color: #15803d; }
  .error { color: #dc2626; font-size: 0.85rem; margin: 0; }
</style>
