// Checks an alert with OpenAI's moderation endpoint, which is free to use, before it's sent.

import "server-only";

export type ModerationResult = { flagged: false } | { flagged: true; categories: string[] };

/**
 * Asks OpenAI whether `text`, and the image if there is one, are harmful. Throws if OPENAI_API_KEY
 * isn't set or the request fails.
 */
export async function moderate(text: string, image?: { bytes: Uint8Array; type: string }): Promise<ModerationResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Moderation isn't set up: OPENAI_API_KEY is missing");
  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: image
        ? [
            { type: "text", text },
            { type: "image_url", image_url: { url: `data:${image.type};base64,${Buffer.from(image.bytes).toString("base64")}` } },
          ]
        : text,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI moderation ${res.status}: ${await res.text()}`);
  const result = (await res.json()).results[0] as { flagged: boolean; categories: Record<string, boolean> };
  if (!result.flagged) return { flagged: false };
  return { flagged: true, categories: Object.keys(result.categories).filter((c) => result.categories[c]) };
}
