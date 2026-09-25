const clean = (value: string | undefined): string => (value ?? '').trim();

/** $OBJECTPAD contract address — live on Robinhood Chain (chain id 4663). */
export const OBJECTPAD_CA = '0x520541D03DEC790ce51746DA2a495dAfa62e87f8';
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
