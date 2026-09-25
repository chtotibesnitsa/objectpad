/** True on touch-first, narrow screens (phones and small tablets). Evaluated once per load. */
export const IS_TOUCH: boolean = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false) && window.innerWidth < 1024;

/** Pixel-ratio range for 3D canvases: phones render at a lower ratio so scrolling stays at 60 fps. */
export const CANVAS_DPR: [number, number] = IS_TOUCH ? [1, 1.25] : [1, 1.6];
