/** Derive the FCFS marker flags from site counts. MUST stay in lockstep with
 * the ETL's derivation in etl/src/normalize.ts (is_fully_fcfs / is_partial_fcfs). */
export function deriveFcfsFlags(
  fcfsTotal: number,
  reservableTotal: number,
): { is_fully_fcfs: boolean; is_partial_fcfs: boolean } {
  return {
    is_fully_fcfs: reservableTotal === 0 && fcfsTotal > 0,
    is_partial_fcfs: fcfsTotal > 0 && reservableTotal > 0,
  }
}
