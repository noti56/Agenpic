import { useState } from "react";
import { Button, Panel, TextInput } from "@agenpic/ui";
import { getOllamaConfig, saveOllamaConfig, testOllamaConnection } from "../lib/ollama";
import styles from "./SettingsPanel.module.css";

interface SettingsPanelProps {
  onClose: () => void;
}

type TestStatus =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok"; models: string[] }
  | { state: "error"; message: string };

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [config, setConfig] = useState(getOllamaConfig());
  const [status, setStatus] = useState<TestStatus>({ state: "idle" });

  const handleSave = () => {
    saveOllamaConfig(config);
    onClose();
  };

  const handleTest = async () => {
    setStatus({ state: "testing" });
    const result = await testOllamaConnection(config);
    setStatus(
      result.ok
        ? { state: "ok", models: result.models ?? [] }
        : { state: "error", message: result.error ?? "Connection failed" },
    );
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <Panel className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Local AI (Ollama)</h3>
          <p className={styles.hint}>
            Configure a local Ollama model for future background jobs (e.g. scanning flagged chat
            messages). Uses Ollama's OpenAI-compatible endpoint.
          </p>

          <TextInput
            label="Base URL"
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
          />
          <TextInput
            label="Model"
            value={config.model}
            onChange={(e) => setConfig({ ...config, model: e.target.value })}
          />

          <div className={styles.testRow}>
            <Button type="button" onClick={handleTest} disabled={status.state === "testing"}>
              {status.state === "testing" ? "Testing…" : "Test Connection"}
            </Button>
            {status.state === "ok" && (
              <span className={styles.statusOk}>
                Connected — {status.models.length} model{status.models.length === 1 ? "" : "s"} available
              </span>
            )}
            {status.state === "error" && <span className={styles.statusError}>{status.message}</span>}
          </div>

          <div className={styles.formActions}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave}>
              Save
            </Button>
          </div>
        </section>
      </Panel>
    </div>
  );
}
