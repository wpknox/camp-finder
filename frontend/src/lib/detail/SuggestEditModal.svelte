<script lang="ts">
  import { submitJson } from "$lib/api";
  import { untrack } from "svelte";
  import type { Facility, EditChanges, Amenities, ToiletType } from "$lib/types";
  import {
    countError,
    feeError,
    feeRangeError,
    latError as checkLat,
    lngError as checkLng,
  } from "$lib/validation";
  import LocationPicker from "./LocationPicker.svelte";
  import ModalShell from "$lib/ui/ModalShell.svelte";
  import SegmentedControl from "$lib/ui/SegmentedControl.svelte";
  import AmenityTriStates from "$lib/campground/AmenityTriStates.svelte";
  import {
    CARRIERS,
    EDITABLE_AMENITIES,
    TRI_OPTIONS,
    fromTriState,
    triState,
    type EditableAmenityKey,
    type CarrierKey,
  } from "$lib/fields";
  import type { TriState } from "$lib/types";

  const STATUS_OPTIONS = [
    { value: "open", label: "Open" },
    { value: "closed", label: "Closed" },
  ] as const;

  let { facility, onclose }: { facility: Facility; onclose: () => void } = $props();

  // Snapshot the facility once at open — the form edits a copy, not live props.
  const initial = untrack(() => facility);
  let feeMin = $state(initial.fee_min?.toString() ?? "");
  let feeMax = $state(initial.fee_max?.toString() ?? "");
  let seasonStart = $state(initial.season_start ?? "");
  let seasonEnd = $state(initial.season_end ?? "");
  let fcfsTotal = $state(initial.fcfs_total?.toString() ?? "");
  let reservableTotal = $state(initial.reservable_total?.toString() ?? "");
  let closedStatus = $state<"open" | "closed">(initial.is_closed ? "closed" : "open");
  let showLocation = $state(false);
  let latStr = $state(initial.lat.toFixed(5));
  let lngStr = $state(initial.lng.toFixed(5));
  const latNum = $derived(Number(latStr));
  const lngNum = $derived(Number(lngStr));
  const latError = $derived(checkLat(latStr, { required: false }));
  const lngError = $derived(checkLng(lngStr, { required: false }));
  const locationValid = $derived(!latError && !lngError && latStr !== "" && lngStr !== "");

  function onPinMove(newLat: number, newLng: number) {
    latStr = newLat.toFixed(5);
    lngStr = newLng.toFixed(5);
  }
  let amenityValues = $state(
    Object.fromEntries(
      EDITABLE_AMENITIES.map(({ key }) => [
        key,
        triState(initial.amenities?.[key] as boolean | null),
      ]),
    ) as Record<EditableAmenityKey, TriState>,
  );
  let toiletType = $state<ToiletType>(initial.amenities?.toiletType ?? "unknown");
  let carrierValues = $state(
    Object.fromEntries(
      CARRIERS.map(({ key }) => [key, triState(initial.cell_coverage?.[key])]),
    ) as Record<CarrierKey, TriState>,
  );
  let note = $state("");
  let submitting = $state(false);
  let submitted = $state(false);
  let errorMsg = $state("");

  // Inline validation, only surfaced after blur — mirrors AuthModal's pattern.
  let touched = $state({ feeMin: false, feeMax: false, fcfsTotal: false, reservableTotal: false });
  function touch(field: keyof typeof touched) {
    touched = { ...touched, [field]: true };
  }
  const feeMinError = $derived(feeError(feeMin));
  const feeMaxError = $derived(feeError(feeMax) || feeRangeError(feeMin, feeMax));
  const feesValid = $derived(!feeMinError && !feeMaxError);

  const fcfsTotalError = $derived(countError(fcfsTotal));
  const reservableTotalError = $derived(countError(reservableTotal));
  const countsValid = $derived(!fcfsTotalError && !reservableTotalError);

  let changes = $derived.by(() => {
    const c: EditChanges = {};
    if (!feesValid || !countsValid || !locationValid) return c;
    const fMin = feeMin === "" ? null : Number(feeMin);
    const fMax = feeMax === "" ? null : Number(feeMax);
    if (fMin !== (facility.fee_min ?? null)) c.fee_min = fMin;
    if (fMax !== (facility.fee_max ?? null)) c.fee_max = fMax;
    if (seasonStart !== (facility.season_start ?? "")) c.season_start = seasonStart;
    if (seasonEnd !== (facility.season_end ?? "")) c.season_end = seasonEnd;
    const ft = fcfsTotal === "" ? null : Number(fcfsTotal);
    if (ft !== (facility.fcfs_total ?? null)) c.fcfs_total = ft;
    const rt = reservableTotal === "" ? null : Number(reservableTotal);
    if (rt !== (facility.reservable_total ?? null)) c.reservable_total = rt;
    if ((closedStatus === "closed") !== !!facility.is_closed)
      c.is_closed = closedStatus === "closed";
    const latRounded = Number(latNum.toFixed(5));
    const lngRounded = Number(lngNum.toFixed(5));
    const origLat = Number(facility.lat.toFixed(5));
    const origLng = Number(facility.lng.toFixed(5));
    if (latRounded !== origLat || lngRounded !== origLng) {
      c.lat = latRounded;
      c.lng = lngRounded;
    }
    const amenityDiff: Partial<Amenities> = {};
    for (const { key } of EDITABLE_AMENITIES) {
      const original = triState(facility.amenities?.[key] as boolean | null);
      const current = amenityValues[key];
      if (current !== original) {
        (amenityDiff as Record<string, boolean | null>)[key] = fromTriState(current);
      }
    }
    if (toiletType !== (facility.amenities?.toiletType ?? "unknown"))
      amenityDiff.toiletType = toiletType;
    if (Object.keys(amenityDiff).length) c.amenities = amenityDiff;
    const carrierDiff: NonNullable<EditChanges["cell_coverage"]> = {};
    for (const { key } of CARRIERS) {
      const original = triState(facility.cell_coverage?.[key]);
      const current = carrierValues[key];
      if (current !== original) {
        carrierDiff[key] = fromTriState(current);
      }
    }
    if (Object.keys(carrierDiff).length) c.cell_coverage = carrierDiff;
    return c;
  });
  let hasChanges = $derived(Object.keys(changes).length > 0);

  async function submit() {
    touched = { feeMin: true, feeMax: true, fcfsTotal: true, reservableTotal: true };
    if (!hasChanges || submitting || !feesValid || !countsValid || !locationValid) return;
    submitting = true;
    errorMsg = "";
    try {
      const r = await submitJson("/api/suggestions", { facility_id: facility.id, changes, note });
      if (r.ok) submitted = true;
      else errorMsg = r.error;
    } finally {
      submitting = false;
    }
  }
</script>

<ModalShell
  eyebrow="Field correction"
  title={`Suggest an edit — ${facility.name}`}
  ariaLabel={`Suggest an edit — ${facility.name}`}
  accent="var(--pine)"
  maxHeight="92vh"
  {onclose}
>
  {#if submitted}
    <p class="success">Thanks — an admin will review your suggestion.</p>
    <button class="btn btn-primary" type="button" onclick={onclose}>Close</button>
  {:else}
    <form
      class="form"
      onsubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div class="row-2">
        <div class="field">
          <label for="fee-min">Fee min ($/night)</label>
          <input
            id="fee-min"
            type="text"
            inputmode="decimal"
            bind:value={feeMin}
            onblur={() => touch("feeMin")}
            placeholder="e.g. 15"
            class:invalid={touched.feeMin && feeMinError}
            aria-invalid={touched.feeMin && !!feeMinError}
          />
          {#if touched.feeMin && feeMinError}<p class="field-error">{feeMinError}</p>{/if}
        </div>
        <div class="field">
          <label for="fee-max">Fee max ($/night)</label>
          <input
            id="fee-max"
            type="text"
            inputmode="decimal"
            bind:value={feeMax}
            onblur={() => touch("feeMax")}
            placeholder="e.g. 25"
            class:invalid={touched.feeMax && feeMaxError}
            aria-invalid={touched.feeMax && !!feeMaxError}
          />
          {#if touched.feeMax && feeMaxError}<p class="field-error">{feeMaxError}</p>{/if}
        </div>
      </div>

      <div class="row-2">
        <div class="field">
          <label for="season-start">Season start</label>
          <input id="season-start" type="text" bind:value={seasonStart} placeholder="e.g. May 15" />
        </div>
        <div class="field">
          <label for="season-end">Season end</label>
          <input id="season-end" type="text" bind:value={seasonEnd} placeholder="e.g. Sept 30" />
        </div>
      </div>

      <div class="row-2">
        <div class="field">
          <label for="fcfs-total">FCFS sites</label>
          <input
            id="fcfs-total"
            type="text"
            inputmode="numeric"
            bind:value={fcfsTotal}
            onblur={() => touch("fcfsTotal")}
            placeholder="e.g. 12"
            class:invalid={touched.fcfsTotal && fcfsTotalError}
            aria-invalid={touched.fcfsTotal && !!fcfsTotalError}
          />
          {#if touched.fcfsTotal && fcfsTotalError}<p class="field-error">{fcfsTotalError}</p>{/if}
        </div>
        <div class="field">
          <label for="reservable-total">Reservable sites</label>
          <input
            id="reservable-total"
            type="text"
            inputmode="numeric"
            bind:value={reservableTotal}
            onblur={() => touch("reservableTotal")}
            placeholder="e.g. 18"
            class:invalid={touched.reservableTotal && reservableTotalError}
            aria-invalid={touched.reservableTotal && !!reservableTotalError}
          />
          {#if touched.reservableTotal && reservableTotalError}<p class="field-error">
              {reservableTotalError}
            </p>{/if}
        </div>
      </div>

      <div class="amenity-row">
        <span class="amenity-label">Campground status</span>
        <SegmentedControl
          options={STATUS_OPTIONS}
          bind:value={closedStatus}
          ariaLabel="Campground status"
        />
      </div>

      <div class="field">
        <button
          type="button"
          class="btn btn-secondary location-toggle"
          onclick={() => (showLocation = !showLocation)}
        >
          {showLocation ? "Hide location editor ▾" : "Adjust location ▸"}
        </button>
        {#if showLocation}
          <div class="row-2">
            <div class="field">
              <label for="loc-lat">Latitude</label>
              <input
                id="loc-lat"
                type="text"
                inputmode="decimal"
                bind:value={latStr}
                class:invalid={!!latError}
                aria-invalid={!!latError}
              />
              {#if latError}<p class="field-error">{latError}</p>{/if}
            </div>
            <div class="field">
              <label for="loc-lng">Longitude</label>
              <input
                id="loc-lng"
                type="text"
                inputmode="decimal"
                bind:value={lngStr}
                class:invalid={!!lngError}
                aria-invalid={!!lngError}
              />
              {#if lngError}<p class="field-error">{lngError}</p>{/if}
            </div>
          </div>
          {#if locationValid}
            <LocationPicker lat={latNum} lng={lngNum} onchange={onPinMove} />
          {/if}
          <p class="ink-faint picker-hint">
            Drag the pin (or tap the map) to the campground's true location.
          </p>
        {/if}
      </div>

      <div class="amenities">
        <span class="section-label">Amenities</span>
        <AmenityTriStates bind:values={amenityValues} bind:toiletType />
      </div>

      <div class="amenities">
        <span class="section-label">Cell coverage — your experience</span>
        {#each CARRIERS as { key, label } (key)}
          <div class="amenity-row">
            <span class="amenity-label">{label}</span>
            <SegmentedControl
              options={TRI_OPTIONS}
              bind:value={carrierValues[key]}
              ariaLabel={label}
            />
          </div>
        {/each}
      </div>

      <div class="field">
        <label for="note">Note <span class="ink-faint">(sources, details — optional)</span></label>
        <textarea
          id="note"
          bind:value={note}
          maxlength="1000"
          rows="3"
          placeholder="e.g. Verified on site 6/2026, water spigot near site 4 is shut off"
        ></textarea>
      </div>

      {#if errorMsg}<p class="error" role="alert">{errorMsg}</p>{/if}

      <div class="actions">
        <button class="btn btn-secondary" type="button" onclick={onclose}>Cancel</button>
        <button class="btn btn-primary" type="submit" disabled={!hasChanges || submitting}>
          {#if submitting}<span class="spinner" aria-hidden="true"></span>{/if}
          {submitting ? "Submitting…" : "Submit suggestion"}
        </button>
      </div>
    </form>
  {/if}
</ModalShell>

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
  .amenity-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .amenity-label {
    font-size: 0.86rem;
    color: var(--ink);
  }
  .location-toggle {
    align-self: flex-start;
  }
  .picker-hint {
    font-size: 0.78rem;
    margin: 0;
  }

  @media (max-width: 640px) {
    .row-2 {
      flex-direction: column;
    }
  }
</style>
