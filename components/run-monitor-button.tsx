"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, LoaderCircle, Play, X } from "lucide-react";
import styles from "./run-monitor-button.module.css";

type Source = "all" | "dof" | "nuevo-leon";
type RunResult = {
  html_url?: string | null;
  actions_url?: string | null;
  message?: string;
};

export function RunMonitorButton() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>("all");
  const [lookbackDays, setLookbackDays] = useState("2");
  const [authorization, setAuthorization] = useState("");
  const [state, setState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);

  function close() {
    if (state === "running") return;
    setOpen(false);
    setState("idle");
    setMessage("");
    setResult(null);
    setAuthorization("");
  }

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("running");
    setMessage("");
    setResult(null);

    try {
      const response = await fetch("/api/actions/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorization,
          source,
          lookback_days: Number.parseInt(lookbackDays, 10),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as RunResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo iniciar el workflow.");

      setResult(payload);
      setAuthorization("");
      setState("success");
      setMessage(payload.message || "Workflow iniciado correctamente.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "No se pudo iniciar el workflow.");
    }
  }

  return (
    <>
      <button className={styles.trigger} type="button" onClick={() => setOpen(true)}>
        <Play size={18} fill="currentColor" />
        Ejecutar monitor
      </button>

      {open ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="run-monitor-title">
            <div className={styles.header}>
              <div>
                <span className={styles.eyebrow}>GitHub Actions</span>
                <h2 id="run-monitor-title">Ejecutar monitor ahora</h2>
                <p>Lanza manualmente el mismo workflow que corre de forma programada.</p>
              </div>
              <button className={styles.close} type="button" onClick={close} aria-label="Cerrar" disabled={state === "running"}>
                <X size={19} />
              </button>
            </div>

            {state === "success" ? (
              <div className={styles.resultBox}>
                <CheckCircle2 size={30} />
                <div>
                  <strong>Workflow iniciado</strong>
                  <p>{message}</p>
                  {(result?.html_url || result?.actions_url) ? (
                    <a href={result.html_url || result.actions_url || "#"} target="_blank" rel="noreferrer">
                      Ver ejecución en GitHub <ExternalLink size={15} />
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <form className={styles.form} onSubmit={run}>
                <label>
                  <span>Fuente</span>
                  <select value={source} onChange={(event) => setSource(event.target.value as Source)} disabled={state === "running"}>
                    <option value="all">Todas las fuentes</option>
                    <option value="dof">DOF</option>
                    <option value="nuevo-leon">Periódico Oficial de Nuevo León</option>
                  </select>
                </label>

                <label>
                  <span>Días a revisar</span>
                  <select value={lookbackDays} onChange={(event) => setLookbackDays(event.target.value)} disabled={state === "running"}>
                    {[1, 2, 3, 4, 5, 6, 7].map((days) => (
                      <option value={String(days)} key={days}>{days} {days === 1 ? "día" : "días"}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.secretField}>
                  <span>Código de autorización</span>
                  <div>
                    <KeyRound size={17} />
                    <input
                      type="password"
                      value={authorization}
                      onChange={(event) => setAuthorization(event.target.value)}
                      placeholder="Código privado de ejecución"
                      autoComplete="off"
                      required
                      disabled={state === "running"}
                    />
                  </div>
                  <small>Este código autoriza el botón. No es tu token de GitHub.</small>
                </label>

                {state === "error" ? <div className={styles.error}>{message}</div> : null}

                <div className={styles.footer}>
                  <button className={styles.cancel} type="button" onClick={close} disabled={state === "running"}>Cancelar</button>
                  <button className={styles.submit} type="submit" disabled={state === "running" || !authorization}>
                    {state === "running" ? <LoaderCircle className={styles.spin} size={18} /> : <Play size={17} fill="currentColor" />}
                    {state === "running" ? "Iniciando…" : "Ejecutar workflow"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
