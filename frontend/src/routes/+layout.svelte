<!-- frontend/src/routes/+layout.svelte -->
<script lang="ts">
  import '../app.css'
  import favicon from '$lib/assets/favicon.svg'

  let { children } = $props()
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="app-shell">
  {@render children()}
</div>

<style>
  :global(body) { margin: 0; font-family: system-ui, sans-serif; }
  .app-shell { display: flex; height: 100dvh; overflow: hidden; }
</style>
