import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod/v4";

// Zero-arg client — resolves ANTHROPIC_API_KEY (or an `ant auth login`
// profile) from the environment. Don't hardcode a key here.
export const client = new Anthropic();

export const MODEL = "claude-opus-5";

/**
 * Every LLM call in the orchestrator goes through this one helper so the
 * structured-output contract (parse against a Zod schema, adaptive thinking,
 * fail loudly rather than silently falling back to prose) is enforced in one
 * place instead of re-implemented per call site.
 */
export async function structuredCall<T extends z.ZodTypeAny>(opts: {
  system: string;
  userContent: string;
  schema: T;
  schemaName: string;
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    thinking: { type: "adaptive" },
    system: opts.system,
    messages: [{ role: "user", content: opts.userContent }],
    output_config: {
      format: zodOutputFormat(opts.schema),
    },
  });

  if (response.parsed_output == null) {
    throw new Error(
      `Structured output parse failed for schema "${opts.schemaName}" ` +
        `(stop_reason: ${response.stop_reason})`,
    );
  }

  return response.parsed_output;
}
