import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract } from "./contracts.js";

function unquote(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  const quoted = trimmed.match(/^["']([\s\S]*)["']$/u);
  return quoted?.[1] ?? trimmed;
}

function topLevelValue(source: string, key: string): string | null {
  const beforeFirstSection = source.split(/^\s*\[/mu, 1)[0] ?? source;
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*([^#\\r\\n]+)`, "mu");
  return unquote(beforeFirstSection.match(pattern)?.[1]);
}

function providerValue(source: string, providerId: string, key: string): string | null {
  const header = `[model_providers.${providerId}]`;
  const lines = source.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return null;
  const sectionLines: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*\[/u.test(line)) break;
    sectionLines.push(line);
  }
  const section = sectionLines.join("\n");
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*([^#\\r\\n]+)`, "mu");
  return unquote(section.match(pattern)?.[1]);
}

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async codex_route() {
      const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), ".codex");
      const configPath = join(codexHome, "config.toml");

      try {
        const source = await readFile(configPath, "utf8");
        const providerId = topLevelValue(source, "model_provider");
        const configuredModel = topLevelValue(source, "model");

        if (providerId === null || providerId === "openai") {
          return {
            kind: "personal" as const,
            label: "Личный OpenAI",
            providerName: "OpenAI",
            baseUrl: null,
            configuredModel,
            error: null,
          };
        }

        const baseUrl = providerValue(source, providerId, "base_url");
        const providerName = providerValue(source, providerId, "name") ?? providerId;
        if (baseUrl?.includes("umka.up-advert.ru")) {
          return {
            kind: "umka" as const,
            label: "Умка",
            providerName,
            baseUrl,
            configuredModel,
            error: null,
          };
        }

        return {
          kind: "custom" as const,
          label: providerName,
          providerName,
          baseUrl,
          configuredModel,
          error: null,
        };
      } catch (cause) {
        const code =
          typeof cause === "object" && cause !== null && "code" in cause
            ? String(cause.code)
            : null;
        if (code === "ENOENT") {
          return {
            kind: "personal" as const,
            label: "Личный OpenAI",
            providerName: "OpenAI",
            baseUrl: null,
            configuredModel: null,
            error: null,
          };
        }
        return {
          kind: "unknown" as const,
          label: "Маршрут не определён",
          providerName: null,
          baseUrl: null,
          configuredModel: null,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
    async claude_route() {
      const claudeHome =
        process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude");
      const settingsPath = join(claudeHome, "settings.json");

      try {
        let fileEnv: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(await readFile(settingsPath, "utf8"));
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "env" in parsed &&
            typeof parsed.env === "object" &&
            parsed.env !== null
          ) {
            fileEnv = parsed.env as Record<string, unknown>;
          }
        } catch (cause) {
          const code =
            typeof cause === "object" && cause !== null && "code" in cause
              ? String(cause.code)
              : null;
          if (code !== "ENOENT") throw cause;
        }

        const fromFile = (name: string): string | null => {
          const value = fileEnv[name];
          return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
        };
        const baseUrl =
          process.env.ANTHROPIC_BASE_URL?.trim() || fromFile("ANTHROPIC_BASE_URL");
        const configuredModel =
          process.env.ANTHROPIC_MODEL?.trim() || fromFile("ANTHROPIC_MODEL");

        if (baseUrl?.includes("umka.up-advert.ru")) {
          return {
            kind: "umka" as const,
            label: "Умка",
            providerName: "Umka (Claude)",
            baseUrl,
            configuredModel,
            error: null,
          };
        }
        if (baseUrl !== null && baseUrl !== undefined && baseUrl !== "") {
          return {
            kind: "custom" as const,
            label: "Сторонний Anthropic",
            providerName: "Anthropic gateway",
            baseUrl,
            configuredModel,
            error: null,
          };
        }
        return {
          kind: "personal" as const,
          label: "Личный Anthropic",
          providerName: "Anthropic",
          baseUrl: null,
          configuredModel,
          error: null,
        };
      } catch (cause) {
        return {
          kind: "unknown" as const,
          label: "Маршрут не определён",
          providerName: "Anthropic",
          baseUrl: null,
          configuredModel: null,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  },
});
