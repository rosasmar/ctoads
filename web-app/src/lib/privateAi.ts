// The private AI model that checks alerts and profiles (lib/moderation.ts), shared with the pages
// that link to its proof.

/** Reads text and images, and runs in a verified TEE on NEAR AI Cloud. */
export const MODERATION_MODEL = "z-ai/glm-5.3-flash";

/** NEAR AI's Verification Center for that model: its TEE and GPU attestation, checked in the browser. */
export const MODEL_PROOF_URL = `https://cloud.near.ai/verify?model=${encodeURIComponent(MODERATION_MODEL)}`;
