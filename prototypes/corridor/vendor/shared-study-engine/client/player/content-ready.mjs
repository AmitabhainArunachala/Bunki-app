/** Render/scheduling eligibility is separate from a translation-audit verdict. */
export const contentReady = entry => entry?.contentReady === true || entry?.translationVerified === true;
