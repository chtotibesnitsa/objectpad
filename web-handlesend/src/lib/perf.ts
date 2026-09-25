const hasWindow = typeof window !== 'undefined';
const coarse = hasWindow && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
const noHover = hasWindow && (window.matchMedia?.('(hover: none)').matches ?? false);

/** True on touch-first devices: phones, iPads/Android tablets (any width) and small windows. Evaluated once per load. */
export const IS_TOUCH: boolean = hasWindow && ((coarse && noHover) || (coarse && window.innerWidth < 1024) || window.innerWidth < 768);

/** Pixel-ratio range for 3D canvases: touch devices render at a lower ratio so scrolling stays at 60 fps. */
export const CANVAS_DPR: [number, number] = IS_TOUCH || (hasWindow && window.innerWidth < 1100) ? [1, 1] : [1, 1.5];

if (hasWindow && IS_TOUCH) document.documentElement.classList.add('touch-lite');
