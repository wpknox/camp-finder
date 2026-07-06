<script lang="ts">
  import type { Facility } from '$lib/types'
  import FCFSBadge from './FCFSBadge.svelte'
  import AmenityGrid from './AmenityGrid.svelte'
  import AlertsSection from './AlertsSection.svelte'
  import DataQualityWarning from './DataQualityWarning.svelte'
  import { compareList } from '$lib/compare/compareStore'
  import SaveButton from '$lib/saved/SaveButton.svelte'
  import RatingsSection from './RatingsSection.svelte'
  import SuggestEditModal from './SuggestEditModal.svelte'
  import ReportDuplicateModal from './ReportDuplicateModal.svelte'
  import AuthModal from '$lib/auth/AuthModal.svelte'
  import { isLoggedIn } from '$lib/auth/authStore'
  import { page } from '$app/stores'

  let { facility, onclose }: { facility: Facility; onclose?: () => void } = $props()

  let suggestOpen = $state(false)
  let duplicateOpen = $state(false)
  let showAuth = $state(false)
  let pendingAction: 'suggest' | 'duplicate' | null = $state(null)
  function onSuggestClick() {
    if (!$isLoggedIn) { pendingAction = 'suggest'; showAuth = true; return; }
    suggestOpen = true
  }
  function onReportDuplicateClick() {
    if (!$isLoggedIn) { pendingAction = 'duplicate'; showAuth = true; return; }
    duplicateOpen = true
  }
  function onAuthSuccess() {
    showAuth = false
    if (pendingAction === 'suggest') suggestOpen = true
    else if (pendingAction === 'duplicate') duplicateOpen = true
    pendingAction = null
  }

  // Desktop-only resizable width (panel is anchored to the right edge).
  let panelWidth = $state(420)
  let resizing = false
  function startResize(e: PointerEvent) {
    resizing = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function doResize(e: PointerEvent) {
    if (!resizing) return
    const w = window.innerWidth - e.clientX
    panelWidth = Math.min(Math.max(w, 320), Math.min(window.innerWidth, 800))
  }
  function endResize(e: PointerEvent) {
    if (!resizing) return
    resizing = false
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  // Mobile-only swipe-down-to-dismiss. The grabber bar drives this; on
  // desktop it's hidden so dragY stays 0 and the transform is a no-op.
  let dragY = $state(0)
  let dragging = $state(false)
  let dragStartY = 0
  const DISMISS_THRESHOLD = 120
  function startDrag(e: PointerEvent) {
    dragging = true
    dragStartY = e.clientY
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function moveDrag(e: PointerEvent) {
    if (!dragging) return
    dragY = Math.max(0, e.clientY - dragStartY)
  }
  function endDrag(e: PointerEvent) {
    if (!dragging) return
    dragging = false
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    if (dragY > DISMISS_THRESHOLD) onclose?.()
    else dragY = 0
  }

  let nearbyMapsUrl = $derived(`https://www.google.com/maps/search/hiking+trails/@${facility.lat},${facility.lng},12z`)
  let reserveUrl    = $derived(`https://www.recreation.gov/camping/campgrounds/${facility.ridb_id}`)
  let feeStr = $derived(
    facility.fee_min === 0   ? 'Free'
    : facility.fee_min != null && facility.fee_min === facility.fee_max ? `$${facility.fee_min}/night`
    : facility.fee_min != null ? `$${facility.fee_min}–$${facility.fee_max}/night`
    : null
  )
  let isComparing = $derived($compareList.some((c) => c.id === facility.id))
</script>

<aside
  class="panel"
  class:dragging
  style="--panel-width: {panelWidth}px; transform: translateY({dragY}px)"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="resize-handle"
    role="separator"
    aria-label="Resize panel"
    onpointerdown={startResize}
    onpointermove={doResize}
    onpointerup={endResize}
  ></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="drag-handle"
    aria-label="Swipe down to close"
    onpointerdown={startDrag}
    onpointermove={moveDrag}
    onpointerup={endDrag}
  >
    <span class="grabber"></span>
  </div>
  <button class="close-btn" onclick={() => onclose?.()} aria-label="Close">✕</button>

  {#if facility.is_closed}
    <div class="closed-banner">
      <span class="closed-icon">⚠</span>
      <span>This campground is currently <strong>CLOSED</strong></span>
    </div>
  {/if}

  <div class="panel-content">
    <header>
      <h2>{facility.name}</h2>
      <p class="meta">{facility.forest}{facility.district ? ` · ${facility.district}` : ''}</p>
      {#if feeStr}
        <p class="fee">{feeStr}</p>
      {:else}
        <p class="fee fee-unknown">
          Fee unknown —
          <a href={reserveUrl} target="_blank" rel="noopener">
            check recreation.gov
          </a>
        </p>
      {/if}
      <SaveButton facilityId={facility.id} facilityName={facility.name} />
      <button class="report-duplicate-link" type="button" onclick={onReportDuplicateClick}>
        Seeing this campground twice? Report a duplicate
      </button>
    </header>

    <FCFSBadge fcfs_total={facility.fcfs_total} reservable_total={facility.reservable_total}
               is_fully_fcfs={facility.is_fully_fcfs} />

    <button
      class="compare-btn"
      class:active={isComparing}
      onclick={() => isComparing
        ? compareList.remove(facility.id)
        : compareList.add({ id: facility.id, name: facility.name })}
    >
      {isComparing ? '✓ In Compare' : '+ Compare'}
    </button>

    <button class="suggest-btn" onclick={onSuggestClick}>
      ✎ Suggest an edit
    </button>

    <AmenityGrid amenities={facility.amenities} />

    {#if facility.description}
      <div class="description">{@html facility.description}</div>
    {/if}

    <AlertsSection facilityId={facility.id} />

    {#if facility.ridb_data_quality !== 'rich' && facility.fs_url}
      <DataQualityWarning quality={facility.ridb_data_quality} fsUrl={facility.fs_url} />
    {/if}

    <div class="links">
      {#if facility.fs_url}
        <a href={facility.fs_url} target="_blank" rel="noopener">View on fs.usda.gov ↗</a>
      {/if}
      <a href={reserveUrl} target="_blank" rel="noopener">Reserve on recreation.gov ↗</a>
      <a href={nearbyMapsUrl} target="_blank" rel="noopener">Nearby activities (Google Maps) ↗</a>
    </div>

    <RatingsSection facilityId={facility.id} facilityName={facility.name} autoOpen={$page.url.searchParams.get('reviews') === '1'} />
  </div>
</aside>

{#if suggestOpen}
  <SuggestEditModal {facility} onclose={() => (suggestOpen = false)} />
{/if}

{#if duplicateOpen}
  <ReportDuplicateModal {facility} onclose={() => (duplicateOpen = false)} />
{/if}

{#if showAuth}
  <AuthModal onclose={() => { showAuth = false; pendingAction = null }} onsuccess={onAuthSuccess} />
{/if}

<style>
  .panel {
    position: fixed;
    background:
      linear-gradient(180deg, var(--paper-2), color-mix(in srgb, var(--paper-2) 88%, var(--paper)));
    color: var(--ink);
    overflow-y: auto;
    z-index: 2000;
    box-shadow: var(--shadow-lg);
    border-left: 1px solid var(--line-strong);
    top: 0; right: 0; bottom: 0;
    width: min(var(--panel-width, 420px), 100vw);
    transition: transform 0.2s var(--ease);
  }
  .panel.dragging { transition: none; }
  .resize-handle {
    position: absolute;
    top: 0; left: 0; bottom: 0;
    width: 6px;
    cursor: ew-resize;
    z-index: 3;
    touch-action: none;
  }
  .resize-handle:hover { background: color-mix(in srgb, var(--moss) 30%, transparent); }
  /* Grabber bar for swipe-down dismiss; mobile only. */
  .drag-handle { display: none; }
  @media (max-width: 640px) {
    /* Full-screen takeover. */
    .panel { top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100dvh; border-radius: 0; border-left: none; }
    .resize-handle { display: none; }
    .drag-handle {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 26px;
      position: sticky;
      top: 0;
      background: var(--paper-2);
      z-index: 4;
      cursor: grab;
      touch-action: none;
    }
    .grabber {
      width: 40px;
      height: 5px;
      border-radius: 3px;
      background: var(--line-strong);
    }
    .close-btn { position: absolute; top: 2px; right: 4px; padding: 0.5rem; }
  }
  .close-btn {
    position: sticky; top: 0; float: right;
    background: none; border: none; font-size: 1.1rem; color: var(--ink-soft); cursor: pointer;
    padding: 1rem; z-index: 1;
    transition: color 0.13s var(--ease);
  }
  .close-btn:hover { color: var(--ink); }
  .panel-content { padding: 1rem 1.4rem 2.4rem; }
  header {
    border-bottom: 1px solid var(--line);
    padding-bottom: 0.9rem;
    margin-bottom: 0.4rem;
  }
  h2 { margin: 0 0 .3rem; font-family: var(--font-display); font-size: 1.55rem; font-weight: 600; line-height: 1.08; }
  .meta { margin: 0; font-family: var(--font-mono); color: var(--ink-soft); font-size: .76rem; letter-spacing: 0.01em; }
  .fee { margin: .7rem 0 .6rem; font-family: var(--font-mono); font-weight: 600; font-size: 1.05rem; color: var(--pine); }
  .fee-unknown { color: var(--ink-faint); font-size: .85rem; font-weight: 500; }
  .fee-unknown a { color: var(--clay); text-decoration: underline; }
  .description { font-size: .86rem; color: var(--ink-soft); line-height: 1.6; margin: .9rem 0; }
  .description :global(h2) { font-family: var(--font-display); font-size: 1rem; color: var(--ink); margin: .9rem 0 .25rem; }
  .description :global(p)  { margin: 0 0 .55rem; }
  .description :global(a) { color: var(--pine); }
  .links { display: flex; flex-direction: column; gap: .55rem; margin-top: 1.1rem; padding-top: 1rem; border-top: 1px solid var(--line); font-size: .88rem; }
  .links a { color: var(--pine); display: inline-flex; align-items: center; gap: 0.35rem; width: fit-content; }
  .compare-btn { background: var(--paper-deep); color: var(--ink); border: 1px solid var(--line-strong); border-radius: var(--radius); padding: .45rem .9rem; cursor: pointer; font-size: .85rem; font-weight: 600; transition: background 0.13s var(--ease); }
  .compare-btn:hover { background: color-mix(in srgb, var(--paper-deep) 80%, var(--line-strong)); }
  .compare-btn.active { background: color-mix(in srgb, var(--moss) 20%, var(--paper-2)); border-color: color-mix(in srgb, var(--moss) 50%, transparent); color: var(--pine-deep); }
  .suggest-btn { background: var(--paper-deep); color: var(--ink); border: 1px solid var(--line-strong); border-radius: var(--radius); padding: .45rem .9rem; cursor: pointer; font-size: .85rem; font-weight: 600; margin-left: .5rem; transition: background 0.13s var(--ease); }
  .suggest-btn:hover { background: color-mix(in srgb, var(--paper-deep) 80%, var(--line-strong)); }
  .report-duplicate-link { display: block; background: none; border: none; padding: 0; margin-top: 0.5rem; font-size: 0.78rem; color: var(--ink-faint); text-decoration: underline; cursor: pointer; font-family: inherit; }
  .report-duplicate-link:hover { color: var(--ink-soft); }
  .closed-banner {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--rust);
    color: #f4ecd6;
    display: flex;
    align-items: center;
    gap: .5rem;
    padding: .75rem 1.4rem;
    font-size: .92rem;
    font-weight: 500;
    box-shadow: var(--shadow-sm);
  }
  .closed-banner strong { letter-spacing: 0.03em; }
  .closed-icon { font-size: 1.1rem; }
</style>
