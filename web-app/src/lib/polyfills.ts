// Some wallet-selector packages use Node's global `Buffer` without importing it. Browsers don't
// have one, so provide it before any wallet code runs. Import this module first.
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  (globalThis as { Buffer?: typeof Buffer }).Buffer = Buffer;
}
