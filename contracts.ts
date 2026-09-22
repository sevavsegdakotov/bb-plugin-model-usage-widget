import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const routeSchema = z.object({
  kind: z.enum(["umka", "personal", "custom", "unknown"]),
  label: z.string(),
  providerName: z.string().nullable(),
  baseUrl: z.string().nullable(),
  configuredModel: z.string().nullable(),
  error: z.string().nullable(),
});

const usageWindowSchema = z.object({
  label: z.string(),
  usedPercent: z.number(),
  remainingPercent: z.number(),
  resetsAt: z.string().nullable(),
  usedUsdCents: z.number().nullable(),
  limitUsdCents: z.number().nullable(),
});

export const widgetStatusSchema = z.object({
  threadId: z.string(),
  providerId: z.string(),
  model: z.string().nullable(),
  route: routeSchema,
  usage: z.object({
    status: z.enum([
      "ok",
      "not_installed",
      "unauthenticated",
      "expired",
      "error",
      "unavailable",
    ]),
    accountEmail: z.string().nullable(),
    planLabel: z.string().nullable(),
    message: z.string().nullable(),
    windows: z.array(usageWindowSchema),
  }),
  refreshedAt: z.string(),
});

export type WidgetStatus = z.infer<typeof widgetStatusSchema>;

export const hostContract = defineRpcContract({
  codex_route: {
    input: z.null(),
    output: routeSchema,
  },
  claude_route: {
    input: z.null(),
    output: routeSchema,
  },
});

export const rpcContract = defineRpcContract({
  widget_status: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: widgetStatusSchema,
  },
});
