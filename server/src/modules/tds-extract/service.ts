import { PARAM_FIELDS } from "../../lib/paramFields.js";
import { logger } from "../../lib/logger.js";
import {
  OPENAI_MODEL,
  OpenAiUnavailableError,
  getOpenAiClient,
} from "../../lib/openaiClient.js";
import {
  technicalParamsSchema,
  type TechnicalParams,
} from "../../validation/technicalParams.js";

/** Raised when a document cannot be turned into a usable 20-field object. */
export class TdsExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TdsExtractionError";
  }
}

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type UploadedDocument = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
};

export type ExtractionResult = {
  /** Validated, admin-editable prefill values. */
  params: TechnicalParams;
  /** Exactly what the model returned, for `ai_raw_extraction`. */
  raw: unknown;
  model: string;
};

/**
 * Structured-output schema derived from PARAM_FIELDS, so the model is forced to
 * return exactly the 20 canonical keys with null for anything it cannot find.
 */
export function buildExtractionSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  for (const [key, label] of PARAM_FIELDS) {
    properties[key] = {
      type: ["string", "null"],
      description: `${label}, copied verbatim from the datasheet including ranges, ≥/≤ symbols and units. Null if not stated.`,
    };
  }

  return {
    type: "object",
    additionalProperties: false,
    required: PARAM_FIELDS.map(([key]) => key),
    properties,
  };
}

const SYSTEM_PROMPT = [
  "You extract technical parameters from tile-adhesive Technical Data Sheets (TDS).",
  "Rules:",
  "1. Return exactly the 20 requested keys — no more, no fewer.",
  "2. Copy each value VERBATIM as printed, preserving ranges (0.45-0.55), comparison symbols (≥, ≤, <, >) and units (N/mm², minutes, kg/L).",
  "3. Never convert units, round numbers, average a range, or reformat a value.",
  "4. If a parameter is not stated on the sheet, return null. Never guess, infer, or copy a value from a similar product.",
  "5. If the document covers several product variants, extract only the primary product and leave ambiguous values null.",
].join("\n");

function toDataUrl(document: UploadedDocument): string {
  return `data:${document.mimeType};base64,${document.buffer.toString("base64")}`;
}

/**
 * Sends a TDS to the model and returns the extracted 20-field object.
 *
 * The result is PREFILL ONLY (blueprint §3a): it is handed to the admin form for
 * review. Nothing here is ever written to `technical_params` directly.
 */
export async function extractParamsFromFile(
  document: UploadedDocument,
): Promise<ExtractionResult> {
  if (!SUPPORTED_MIME_TYPES.includes(document.mimeType as never)) {
    throw new TdsExtractionError(
      `Unsupported file type '${document.mimeType}'. Upload a PDF, PNG, JPEG or WebP.`,
    );
  }

  const client = getOpenAiClient(); // throws OpenAiUnavailableError

  const dataUrl = toDataUrl(document);
  const content =
    document.mimeType === "application/pdf"
      ? ([
          {
            type: "input_file" as const,
            filename: document.originalName,
            file_data: dataUrl,
          },
          {
            type: "input_text" as const,
            text: "Extract the 20 technical parameters from this TDS.",
          },
        ] as const)
      : ([
          { type: "input_image" as const, image_url: dataUrl, detail: "high" as const },
          {
            type: "input_text" as const,
            text: "Extract the 20 technical parameters from this TDS image.",
          },
        ] as const);

  let outputText: string;
  try {
    const response = await client.responses.create({
      model: OPENAI_MODEL,
      // Deterministic-as-possible transcription, not creative writing.
      temperature: 0,
      instructions: SYSTEM_PROMPT,
      input: [{ role: "user", content: [...content] }],
      text: {
        format: {
          type: "json_schema",
          name: "technical_params",
          strict: true,
          schema: buildExtractionSchema(),
        },
      },
    });

    outputText = response.output_text;
  } catch (error) {
    throw new TdsExtractionError("The extraction request to OpenAI failed", {
      cause: error,
    });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(outputText);
  } catch (error) {
    throw new TdsExtractionError("OpenAI returned a non-JSON response", {
      cause: error,
    });
  }

  const parsed = technicalParamsSchema.safeParse(raw);

  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      "TDS extraction did not match the canonical parameter schema",
    );
    throw new TdsExtractionError(
      "OpenAI returned parameters that do not match the expected 20-field schema",
    );
  }

  return { params: parsed.data, raw, model: OPENAI_MODEL };
}

export { OpenAiUnavailableError };
