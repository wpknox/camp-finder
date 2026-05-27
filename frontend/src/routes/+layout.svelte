<script lang="ts">
  import '../app.css'
  let { children } = $props()
</script>

<div class="app-shell">
  {@render children()}
</div>

<style>
  :global(body) { margin: 0; font-family: system-ui, sans-serif; }
  .app-shell { display: flex; height: 100dvh; overflow: hidden; }
</style>
