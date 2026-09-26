/** Shared clock so the HTML overlay and the WebGL stage stay on the same beat. */
export interface ScanClock { phase: number; startedAt: number; }
/** Duration of each hero step: object, phone scan, 3D rebuild, one-of-one check, stock-paired coin. */
export const PHASE_MS = [3400, 5200, 4600, 3800, 7800] as const;
/** Fraction of each shot segment at which the phone fires its flash (the HTML overlay uses the same moment). */
export const SHOT_AT = 0.62;
