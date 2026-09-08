import OpenAI from "openai";

import { env } from "../config/env.js";

/** Raised when the OpenAI integration is unavailable or misconfigured. */
export class OpenAiUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OpenAiUnavailableError";
  }
}

/** Model used for TDS extraction and the AI copy features. Vision-capable. */
export const OPENAI_MODEL: string = env.OPENAI_MODEL;

export function isOpenAiConfigured(): boolean {
  return env.OPENAI_API_KEY !== undefined;
}

let client: OpenAI | null = null;

/**
 * Lazily constructs the shared client.
 *
 * The API key is optional so the rest of the server boots without it; callers
 * must handle OpenAiUnavailableError and degrade gracefully.
 */
export function getOpenAiClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new OpenAiUnavailableError(
      "OPENAI_API_KEY is not configured, so AI features are disabled",
    );
  }

  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 2 });
  return client;
}
