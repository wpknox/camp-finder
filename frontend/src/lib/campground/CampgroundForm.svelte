<script lang="ts">
  import LocationPicker from "$lib/detail/LocationPicker.svelte";
  import AmenityTriStates from "./AmenityTriStates.svelte";
  import type { CampgroundDraft } from "$lib/campgroundSubmission";

  let {
    draft = $bindable(),
    errors,
    showAdminFields = false,
    showAllErrors = false,
    idPrefix = "cg",
  }: {
    draft: CampgroundDraft;
    errors: Partial<Record<keyof CampgroundDraft, string>>;
    showAdminFields?: boolean;
    showAllErrors?: boolean;
    idPrefix?: string;
  } = $props();

  // Inline validation, surfaced after blur or when the parent signals a submit attempt.
  let touched = $state<Partial<Record<keyof CampgroundDraft, boolean>>>({});
  function touch(field: keyof CampgroundDraft) {
    touched = { ...touched, [field]: true };
  }
  function err(field: keyof CampgroundDraft): string {
    return showAllErrors || touched[field] ? (errors[field] ?? "") : "";
  }

  const latNum = $derived(Number(draft.latStr));
  const lngNum = $derived(Number(draft.lngStr));
  const locationValid = $derived(!errors.latStr && !errors.lngStr);

  function onPinMove(newLat: number, newLng: number) {
    draft.latStr = newLat.toFixed(5);
    draft.lngStr = newLng.toFixed(5);
  }
</script>

<div class="form">
  <div class="field">
    <label for="{idPrefix}-name">Campground name <span class="ink-faint">(required)</span></label>
    <input
      id="{idPrefix}-name"
      type="text"
      bind:value={draft.name}
      onblur={() => touch("name")}
      maxlength="120"
      placeholder="e.g. Aspen Hollow Campground"
      class:invalid={!!err("name")}
      aria-invalid={!!err("name")}
    />
    {#if err("name")}<p class="field-error">{err("name")}</p>{/if}
  </div>

  <div class="field">
    <span class="section-label">Location — drag the pin or tap the map</span>
    {#if locationValid}
      <LocationPicker lat={latNum} lng={lngNum} onchange={onPinMove} />
    {/if}
    <div class="row-2">
      <div class="field">
        <label for="{idPrefix}-lat">Latitude</label>
        <input
          id="{idPrefix}-lat"
          type="text"
          inputmode="decimal"
          bind:value={draft.latStr}
          onblur={() => touch("latStr")}
          class:invalid={!!err("latStr")}
          aria-invalid={!!err("latStr")}
        />
        {#if err("latStr")}<p class="field-error">{err("latStr")}</p>{/if}
      </div>
      <div class="field">
        <label for="{idPrefix}-lng">Longitude</label>
        <input
          id="{idPrefix}-lng"
          type="text"
          inputmode="decimal"
          bind:value={draft.lngStr}
          onblur={() => touch("lngStr")}
          class:invalid={!!err("lngStr")}
          aria-invalid={!!err("lngStr")}
        />
        {#if err("lngStr")}<p class="field-error">{err("lngStr")}</p>{/if}
      </div>
    </div>
  </div>

  <div class="row-2">
    <div class="field">
      <label for="{idPrefix}-fee-min"
        >Fee min ($/night) <span class="ink-faint">(optional)</span></label
      >
      <input
        id="{idPrefix}-fee-min"
        type="text"
        inputmode="decimal"
        bind:value={draft.feeMin}
        onblur={() => touch("feeMin")}
        placeholder="e.g. 15 (blank = 0)"
        class:invalid={!!err("feeMin")}
        aria-invalid={!!err("feeMin")}
      />
      {#if err("feeMin")}<p class="field-error">{err("feeMin")}</p>{/if}
    </div>
    <div class="field">
      <label for="{idPrefix}-fee-max"
        >Fee max ($/night) <span class="ink-faint">(optional)</span></label
      >
      <input
        id="{idPrefix}-fee-max"
        type="text"
        inputmode="decimal"
        bind:value={draft.feeMax}
        onblur={() => touch("feeMax")}
        placeholder="e.g. 25 (blank = 0)"
        class:invalid={!!err("feeMax")}
        aria-invalid={!!err("feeMax")}
      />
      {#if err("feeMax")}<p class="field-error">{err("feeMax")}</p>{/if}
    </div>
  </div>

  <div class="row-2">
    <div class="field">
      <label for="{idPrefix}-fcfs">FCFS sites <span class="ink-faint">(optional)</span></label>
      <input
        id="{idPrefix}-fcfs"
        type="text"
        inputmode="numeric"
        bind:value={draft.fcfsTotal}
        onblur={() => touch("fcfsTotal")}
        placeholder="e.g. 12 (blank = 0)"
        class:invalid={!!err("fcfsTotal")}
        aria-invalid={!!err("fcfsTotal")}
      />
      {#if err("fcfsTotal")}<p class="field-error">{err("fcfsTotal")}</p>{/if}
    </div>
    <div class="field">
      <label for="{idPrefix}-reservable"
        >Reservable sites <span class="ink-faint">(optional)</span></label
      >
      <input
        id="{idPrefix}-reservable"
        type="text"
        inputmode="numeric"
        bind:value={draft.reservableTotal}
        onblur={() => touch("reservableTotal")}
        placeholder="e.g. 18 (blank = 0)"
        class:invalid={!!err("reservableTotal")}
        aria-invalid={!!err("reservableTotal")}
      />
      {#if err("reservableTotal")}<p class="field-error">{err("reservableTotal")}</p>{/if}
    </div>
  </div>

  <div class="row-2">
    <div class="field">
      <label for="{idPrefix}-season-start"
        >Season start <span class="ink-faint">(optional)</span></label
      >
      <input
        id="{idPrefix}-season-start"
        type="text"
        bind:value={draft.seasonStart}
        onblur={() => touch("seasonStart")}
        placeholder="e.g. May 15"
        class:invalid={!!err("seasonStart")}
        aria-invalid={!!err("seasonStart")}
      />
      {#if err("seasonStart")}<p class="field-error">{err("seasonStart")}</p>{/if}
    </div>
    <div class="field">
      <label for="{idPrefix}-season-end">Season end <span class="ink-faint">(optional)</span></label
      >
      <input
        id="{idPrefix}-season-end"
        type="text"
        bind:value={draft.seasonEnd}
        onblur={() => touch("seasonEnd")}
        placeholder="e.g. Sept 30"
        class:invalid={!!err("seasonEnd")}
        aria-invalid={!!err("seasonEnd")}
      />
      {#if err("seasonEnd")}<p class="field-error">{err("seasonEnd")}</p>{/if}
    </div>
  </div>

  <div class="amenities">
    <span class="section-label">Amenities <span class="ink-faint">(optional)</span></span>
    <AmenityTriStates bind:values={draft.amenities} bind:toiletType={draft.toiletType} />
  </div>

  {#if showAdminFields}
    <div class="amenities">
      <span class="section-label">Admin details</span>
      <div class="field">
        <label for="{idPrefix}-description"
          >Description <span class="ink-faint">(shown publicly)</span></label
        >
        <textarea
          id="{idPrefix}-description"
          bind:value={draft.description}
          rows="4"
          onblur={() => touch("description")}
          class:invalid={!!err("description")}
          aria-invalid={!!err("description")}></textarea>
        {#if err("description")}<p class="field-error">{err("description")}</p>{/if}
      </div>
      <div class="row-2">
        <div class="field">
          <label for="{idPrefix}-forest">Forest</label>
          <input
            id="{idPrefix}-forest"
            type="text"
            bind:value={draft.forest}
            onblur={() => touch("forest")}
            class:invalid={!!err("forest")}
            aria-invalid={!!err("forest")}
          />
          {#if err("forest")}<p class="field-error">{err("forest")}</p>{/if}
        </div>
        <div class="field">
          <label for="{idPrefix}-district">District</label>
          <input
            id="{idPrefix}-district"
            type="text"
            bind:value={draft.district}
            onblur={() => touch("district")}
            class:invalid={!!err("district")}
            aria-invalid={!!err("district")}
          />
          {#if err("district")}<p class="field-error">{err("district")}</p>{/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .row-2 {
    display: flex;
    gap: 0.75rem;
  }
  .row-2 .field {
    flex: 1;
    min-width: 0;
  }
  .amenities {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    border-top: 1px solid var(--line);
    padding-top: 0.8rem;
  }
  .section-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink-soft);
  }

  @media (max-width: 640px) {
    .row-2 {
      flex-direction: column;
    }
  }
</style>
