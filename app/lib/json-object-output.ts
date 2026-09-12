import type { z } from "zod";

function cleanJson(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed;
}

/** Uses json_object instead of json_schema for broad OpenAI-compatible API support. */
export function jsonObjectOutput<T>(schema: z.ZodType<T>) {
  return {
    name: "json-object",
    responseFormat: Promise.resolve({ type: "json" as const }),
    parseCompleteOutput: async ({ text }: { text: string }) => schema.parse(JSON.parse(cleanJson(text))),
    parsePartialOutput: async () => undefined,
    createElementStreamTransform: () => undefined,
  };
}
