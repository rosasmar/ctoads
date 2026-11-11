// Checks alerts, profiles and profile changes by text before they're saved or sent, with private AI:
// a model on NEAR AI Cloud that runs in a TEE (a sealed enclave that neither NEAR AI, nor the cloud
// provider, nor we can look into). Anyone can check the model's hardware attestation at MODEL_PROOF_URL (lib/privateAi.ts).

import "server-only";
import { MODERATION_MODEL as MODEL } from "@/lib/privateAi";

export type ModerationResult = { flagged: false } | { flagged: true; categories: string[] };

const API_URL = "https://cloud-api.near.ai/v1/chat/completions";

/** What we refuse. The same rules as in the terms. */
const CATEGORIES = {
  spam: "spam, or unsolicited advertising for other projects",
  scam: "scams, phishing links, fake giveaways, or asking for seed phrases, private keys or passwords",
  harassment: "harassment, insults or bullying aimed at someone",
  threats: "threats of violence or harm",
  hate: "hate against people for who they are",
  sexual: "sexual content",
  "self-harm": "encouraging self-harm or suicide",
  illegal: "selling or arranging something illegal",
  "personal-info": "someone's private personal information, such as a phone number or home address",
};

const INSTRUCTIONS = `You moderate messages that holders of a meme NFT send each other, and their public profiles.
Crypto slang, jokes, memes, trading talk, swearing that isn't aimed at someone, and links to normal websites are fine.
Flag the message only if it clearly contains one of these:
${Object.entries(CATEGORIES)
  .map(([id, meaning]) => `- ${id}: ${meaning}`)
  .join("\n")}
If there's an image, check it too.
Answer with JSON only: {"flagged": true or false, "categories": [the ids that apply, empty if none]}.`;

/**
 * Asks the private model whether `text`, and the image if there is one, break the rules. Throws if
 * NEARAI_API_KEY isn't set or the request fails, so nothing unchecked gets through.
 */
export async function moderate(text: string, image?: { bytes: Uint8Array; type: string }): Promise<ModerationResult> {
  const key = process.env.NEARAI_API_KEY;
  if (!key) throw new Error("Moderation isn't set up: NEARAI_API_KEY is missing");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: INSTRUCTIONS },
        {
          role: "user",
          content: image
            ? [
                { type: "text", text: `Message:\n${text}` },
                { type: "image_url", image_url: { url: `data:${image.type};base64,${Buffer.from(image.bytes).toString("base64")}` } },
              ]
            : `Message:\n${text}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`NEAR AI moderation ${res.status}: ${await res.text()}`);
  const answer = (await res.json()).choices?.[0]?.message?.content;
  return parseAnswer(typeof answer === "string" ? answer : "");
}

/** Reads the model's JSON. Anything it can't read counts as an error, never as "fine". */
function parseAnswer(answer: string): ModerationResult {
  const json = answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1);
  let parsed: { flagged?: unknown; categories?: unknown };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`NEAR AI moderation gave an unreadable answer: ${answer.slice(0, 200)}`);
  }
  if (typeof parsed.flagged !== "boolean") throw new Error(`NEAR AI moderation gave no verdict: ${answer.slice(0, 200)}`);
  if (!parsed.flagged) return { flagged: false };
  const categories = Array.isArray(parsed.categories)
    ? parsed.categories.filter((c): c is string => typeof c === "string" && c in CATEGORIES)
    : [];
  return { flagged: true, categories: categories.length ? categories : ["breaking the rules"] };
}
