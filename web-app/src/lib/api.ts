// Small helpers shared by the API routes.

import "server-only";

/** A JSON error the page can show: `{ error: message }`. */
export const errorResponse = (message: string, status: number) => Response.json({ error: message }, { status });

/** Logs `e` on the server and returns a generic 500, so no internal detail reaches the browser. */
export function serverError(e: unknown): Response {
  console.error(e);
  return errorResponse("Something went wrong. Please try again.", 500);
}
