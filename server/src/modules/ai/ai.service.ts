import { logger } from "../../lib/logger.js";
import {
  OPENAI_MODEL,
  OpenAiUnavailableError,
  getOpenAiClient,
} from "../../lib/openaiClient.js";
import {
  buildLetterPrompt,
  buildPitchPrompt,
  type LetterContext,
  type PitchContext,
} from "./prompts.js";

export const MAX_PITCH_LINES = 3;

const PITCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      minItems: 1,
      maxItems: MAX_PITCH_LINES,
      items: { type: "string" },
    },
  },
} as const;

/** Trim, drop blanks, de-duplicate and cap at three lines. */
export function normalizePitchLines(lines: unknown): string[] {
  if (!Array.isArray(lines)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    if (typeof line !== "string") continue;
    const trimmed = line.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;

    seen.add(trimmed);
    result.push(trimmed);
    if (result.length === MAX_PITCH_LINES) break;
  }

  return result;
}

/**
 * Generates pitch lines. Throws (any reason) so the caller can fall back —
 * an AI outage must never fail the request.
 */
export async function generatePitchLines(
  context: PitchContext,
): Promise<string[]> {
  const client = getOpenAiClient();
  const { instructions, input } = buildPitchPrompt(context);

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    temperature: 0.4,
    instructions,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "pitch_lines",
        strict: true,
        schema: PITCH_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const parsed = JSON.parse(response.output_text) as { lines?: unknown };
  const lines = normalizePitchLines(parsed.lines);

  if (lines.length === 0) {
    throw new Error("OpenAI returned no usable pitch lines");
  }
  return lines;
}

export async function generateLetter(context: LetterContext): Promise<string> {
  const client = getOpenAiClient();
  const { instructions, input } = buildLetterPrompt(context);

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    temperature: 0.4,
    instructions,
    input,
  });

  const content = response.output_text.trim();

  if (content.length === 0) {
    throw new Error("OpenAI returned an empty recommendation letter");
  }

  const wordCount = content.split(/\s+/).length;
  if (wordCount < 150 || wordCount > 400) {
    // Usable but off-brief: worth knowing about without failing the request.
    logger.warn({ wordCount }, "Recommendation letter is outside the target length");
  }

  return content;
}

export { OpenAiUnavailableError };
