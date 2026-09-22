import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { hostContract, rpcContract, type WidgetStatus } from "./contracts.js";

const UNKNOWN_ROUTE: WidgetStatus["route"] = {
  kind: "unknown",
  label: "Маршрут не определён",
  providerName: null,
  baseUrl: null,
  configuredModel: null,
  error: null,
};

export { rpcContract } from "./contracts.js";
export type { WidgetStatus } from "./contracts.js";

export default function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: hostContract });

  bb.rpc.register(rpcContract, {
    async widget_status({ threadId }) {
      const thread = await bb.sdk.threads.get({ threadId, include: "environment" });
      const environment = "environment" in thread ? thread.environment : null;
      const hostId = environment?.hostId ?? null;
      const execution = await bb.sdk.threads.defaultExecutionOptions({ threadId });

      let route = UNKNOWN_ROUTE;
      if (
        (thread.providerId === "codex" || thread.providerId === "claude-code") &&
        hostId !== null
      ) {
        try {
          route = await host.call(
            thread.providerId === "codex" ? "codex_route" : "claude_route",
            null,
            { hostId, timeoutMs: 5_000 },
          );
        } catch (cause) {
          route = {
            ...UNKNOWN_ROUTE,
            error: cause instanceof Error ? cause.message : String(cause),
          };
        }
      } else if (thread.providerId !== "codex" && thread.providerId !== "claude-code") {
        route = {
          kind: "personal",
          label: thread.providerId === "claude-code" ? "Личный Anthropic" : thread.providerId,
          providerName: thread.providerId,
          baseUrl: null,
          configuredModel: null,
          error: null,
        };
      }

      let usage: WidgetStatus["usage"] = {
        status: "unavailable",
        accountEmail: null,
        planLabel: null,
        message: hostId === null ? "У потока ещё нет выбранной машины." : null,
        windows: [],
      };

      if (hostId !== null) {
        try {
          const allUsage = await bb.sdk.system.usageLimits({
            hostId,
            providerId: thread.providerId,
          });
          const providerUsage = allUsage[thread.providerId];
          if (providerUsage !== undefined) {
            if (providerUsage.status === "ok") {
              usage = {
                status: "ok",
                accountEmail: providerUsage.accountEmail,
                planLabel: providerUsage.planLabel,
                message: null,
                windows: providerUsage.windows.map((window) => ({
                  label: window.label,
                  usedPercent: Math.max(0, Math.min(100, window.usedPercent)),
                  remainingPercent: Math.max(0, Math.min(100, 100 - window.usedPercent)),
                  resetsAt: window.resetsAt,
                  usedUsdCents: window.cost?.usedUsdCents ?? null,
                  limitUsdCents: window.cost?.limitUsdCents ?? null,
                })),
              };
            } else {
              usage = {
                status: providerUsage.status,
                accountEmail:
                  "accountEmail" in providerUsage &&
                  typeof providerUsage.accountEmail === "string"
                    ? providerUsage.accountEmail
                    : null,
                planLabel:
                  "planLabel" in providerUsage && typeof providerUsage.planLabel === "string"
                    ? providerUsage.planLabel
                    : null,
                message:
                  "message" in providerUsage && typeof providerUsage.message === "string"
                    ? providerUsage.message
                    : null,
                windows: [],
              };
            }
          }
        } catch (cause) {
          usage = {
            status: "error",
            accountEmail: null,
            planLabel: null,
            message: cause instanceof Error ? cause.message : String(cause),
            windows: [],
          };
        }
      }

      return {
        threadId,
        providerId: thread.providerId,
        model: execution?.model ?? route.configuredModel,
        route,
        usage,
        refreshedAt: new Date().toISOString(),
      };
    },
  });

  bb.log.info("Model usage widget loaded");
}
