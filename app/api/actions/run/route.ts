import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TriggerBody = {
  authorization?: unknown;
  source?: unknown;
  lookback_days?: unknown;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function safeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function repositoryFromEnvironment() {
  const explicit = process.env.GITHUB_ACTIONS_REPOSITORY?.trim();
  if (explicit) return explicit;

  const owner = process.env.VERCEL_GIT_REPO_OWNER?.trim();
  const repo = process.env.VERCEL_GIT_REPO_SLUG?.trim();
  return owner && repo ? `${owner}/${repo}` : "";
}

export async function POST(request: Request) {
  const token = process.env.GITHUB_ACTIONS_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || "";
  const triggerSecret = process.env.MONITOR_TRIGGER_SECRET?.trim() || "";
  const repository = repositoryFromEnvironment();
  const workflow = process.env.GITHUB_ACTIONS_WORKFLOW?.trim() || "";
  const ref = process.env.GITHUB_ACTIONS_REF?.trim() || process.env.VERCEL_GIT_COMMIT_REF?.trim() || "main";

  const missing = [
    !token ? "GITHUB_ACTIONS_TOKEN" : "",
    !triggerSecret ? "MONITOR_TRIGGER_SECRET" : "",
    !repository ? "GITHUB_ACTIONS_REPOSITORY" : "",
    !workflow ? "GITHUB_ACTIONS_WORKFLOW" : "",
  ].filter(Boolean);

  if (missing.length) {
    return json(
      {
        ok: false,
        error: `La ejecución manual no está configurada. Faltan: ${missing.join(", ")}.`,
      },
      503,
    );
  }

  let body: TriggerBody;
  try {
    body = (await request.json()) as TriggerBody;
  } catch {
    return json({ ok: false, error: "Solicitud inválida." }, 400);
  }

  const authorization = typeof body.authorization === "string" ? body.authorization : "";
  if (!authorization || !safeEqual(authorization, triggerSecret)) {
    return json({ ok: false, error: "Código de autorización incorrecto." }, 401);
  }

  const source = typeof body.source === "string" ? body.source : "all";
  const allowedSources = new Set(["all", "dof", "nuevo-leon"]);
  if (!allowedSources.has(source)) {
    return json({ ok: false, error: "Fuente inválida." }, 400);
  }

  const lookbackDays = Number.parseInt(String(body.lookback_days ?? "2"), 10);
  if (!Number.isInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 7) {
    return json({ ok: false, error: "Los días a revisar deben estar entre 1 y 7." }, 400);
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return json({ ok: false, error: "GITHUB_ACTIONS_REPOSITORY debe tener formato owner/repo." }, 500);
  }

  const [owner, repo] = repository.split("/");
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;

  const githubResponse = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    body: JSON.stringify({
      ref,
      inputs: {
        source,
        lookback_days: String(lookbackDays),
      },
    }),
    cache: "no-store",
  });

  const responseText = await githubResponse.text();
  let githubPayload: Record<string, unknown> = {};
  if (responseText) {
    try {
      githubPayload = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      githubPayload = {};
    }
  }

  if (!githubResponse.ok) {
    const githubMessage = typeof githubPayload.message === "string" ? githubPayload.message : "GitHub rechazó la ejecución.";
    return json(
      {
        ok: false,
        error: githubMessage,
        github_status: githubResponse.status,
      },
      githubResponse.status >= 400 && githubResponse.status < 500 ? githubResponse.status : 502,
    );
  }

  const workflowRunId = typeof githubPayload.workflow_run_id === "number" ? githubPayload.workflow_run_id : null;
  const htmlUrl = typeof githubPayload.html_url === "string" ? githubPayload.html_url : null;
  const actionsUrl = `https://github.com/${repository}/actions/workflows/${encodeURIComponent(workflow)}`;

  return json({
    ok: true,
    message: "Workflow iniciado correctamente.",
    workflow_run_id: workflowRunId,
    html_url: htmlUrl,
    actions_url: actionsUrl,
    source,
    lookback_days: lookbackDays,
  });
}
