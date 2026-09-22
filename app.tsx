import { useCallback, useEffect, useMemo, useState } from "react";
import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract, WidgetStatus } from "./server";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function formatReset(value: string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function routeTone(kind: WidgetStatus["route"]["kind"]): string {
  switch (kind) {
    case "umka":
      return "bg-emerald-500";
    case "personal":
      return "bg-blue-500";
    case "custom":
      return "bg-violet-500";
    default:
      return "bg-amber-500";
  }
}

function LimitBar({ window }: { window: WidgetStatus["usage"]["windows"][number] }) {
  const reset = formatReset(window.resetsAt);
  const danger = window.remainingPercent <= 10;
  const warning = window.remainingPercent > 10 && window.remainingPercent <= 25;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">{window.label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          осталось {Math.round(window.remainingPercent)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            danger ? "bg-destructive" : warning ? "bg-amber-500" : "bg-blue-500",
          )}
          style={{ width: `${window.remainingPercent}%` }}
        />
      </div>
      {reset !== null ? (
        <div className="text-[11px] text-muted-foreground">обновится {reset}</div>
      ) : null}
    </div>
  );
}

function Widget({ threadId, isCompactViewport }: { threadId: string; isCompactViewport: boolean }) {
  const rpc = useRpc<typeof rpcContract>();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<WidgetStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await rpc.call("widget_status", { threadId });
      setStatus(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [rpc, threadId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const routeLabel = status?.route.label ?? "Лимиты";
  const dotClass = routeTone(status?.route.kind ?? "unknown");
  const hasPersonalWindows = status?.usage.status === "ok" && status.usage.windows.length > 0;
  const personalIsInactive = status?.route.kind === "umka";
  const personalProviderLabel =
    status?.providerId === "claude-code" ? "Личный Anthropic" : "Личный Codex";
  const accountLabel = useMemo(() => {
    if (status?.usage.planLabel && status.usage.accountEmail) {
      return `${status.usage.planLabel} · ${status.usage.accountEmail}`;
    }
    return status?.usage.planLabel ?? status?.usage.accountEmail ?? null;
  }, [status]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-7 rounded-md"
          aria-label={`Лимиты моделей. Активный маршрут: ${routeLabel}`}
        >
          <Icon name="ChartColumn" className="size-4" />
          <span
            aria-hidden="true"
            className={cn(
              "absolute right-0.5 bottom-0.5 size-2 rounded-full border-2 border-background",
              dotClass,
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "w-[360px] max-w-[calc(100vw-24px)] space-y-4",
          isCompactViewport && "w-[calc(100vw-24px)]",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Лимиты моделей</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Текущий поток BB</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Обновить лимиты"
          >
            <Icon
              name={loading ? "Spinner" : "ArrowReloadHorizontal"}
              className={cn("size-4", loading && "animate-spin")}
            />
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Запросы идут через</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2 py-1 text-xs font-medium shadow-sm">
              <span className={cn("size-2 rounded-full", dotClass)} />
              {routeLabel}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Модель</span>
            <span className="max-w-[210px] truncate font-mono text-xs">
              {status?.model ?? "—"}
            </span>
          </div>
        </div>

        {status?.route.kind === "umka" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Корпоративный лимит Умки</span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                активен
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-full rounded-full bg-emerald-500/35" />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Умка использует общий лимит команды, но шлюз не сообщает точный остаток через API.
            </p>
          </div>
        ) : null}

        {hasPersonalWindows ? (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  {personalIsInactive
                    ? `${personalProviderLabel} — резерв`
                    : personalProviderLabel}
                </h3>
                {personalIsInactive ? (
                  <span className="text-[11px] text-muted-foreground">не расходуется</span>
                ) : null}
              </div>
              {accountLabel !== null ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{accountLabel}</p>
              ) : null}
            </div>
            {status.usage.windows.map((window) => (
              <LimitBar key={`${window.label}-${window.resetsAt ?? "none"}`} window={window} />
            ))}
          </div>
        ) : status !== null ? (
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {status.usage.message ?? "Провайдер не сообщил данные о лимитах."}
          </div>
        ) : null}

        {error !== null ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "model-usage",
    title: "Лимиты моделей",
    component: ({ threadId, isCompactViewport }) => (
      <Widget threadId={threadId} isCompactViewport={isCompactViewport} />
    ),
  });
});
