const clean = (value: string | undefined): string => (value ?? '').trim();

/** $OBJECTPAD contract address once launched (set VITE_OBJECTPAD_TOKEN_ADDRESS). Null until then; never invented. */
export const OBJECTPAD_CA: string | null = /^0x[a-fA-F0-9]{40}$/.test(clean(import.meta.env.VITE_OBJECTPAD_TOKEN_ADDRESS)) ? clean(import.meta.env.VITE_OBJECTPAD_TOKEN_ADDRESS) : null;
/** ObjectPad object id of the $OBJECTPAD launch itself (set VITE_OBJECTPAD_OBJECT_ID), so its coin page lives on ObjectPad. */
const OBJECT_ID = clean(import.meta.env.VITE_OBJECTPAD_OBJECT_ID);
/** Where the $OBJECTPAD chip goes: its own coin page on ObjectPad when launched, the burn page before that. */
export const OBJECTPAD_COIN_PATH: string = /^[a-f0-9]{64}$/.test(OBJECT_ID) ? `/objects/${OBJECT_ID}` : '/burn';
/** ObjectPad's official X account. Shown across the site as social proof. */
export const OBJECTPAD_X_URL = 'https://x.com/ObjectPadFun';
export const OBJECTPAD_X_HANDLE = '@ObjectPadFun';
/**
 * Signed ObjectPad Android APK on objectpad.fun (set VITE_OBJECTPAD_APK_URL, e.g. '/downloads/objectpad.apk').
 * The download button stays hidden until this is set, so nobody sees a dead link.
 */
export const OBJECTPAD_APK_URL: string | null = clean(import.meta.env.VITE_OBJECTPAD_APK_URL as string | undefined) || null;
