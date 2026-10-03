// capsule-cron: a Cloudflare Worker whose only job is to start the GitHub price-check
// workflow at exact times (GitHub's own cron often fires hours late).
// Secrets (set with `npx wrangler secret put NAME`):
//   GITHUB_TOKEN     fine-grained token, repo CyberSecDigestDaily/capsule, permission Actions: read & write
//   DISCORD_WEBHOOK  optional; gets a message if a dispatch fails (e.g. the token expired)

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatch(env, event.cron));
  },

  // Visiting the worker URL just shows a status line; it never triggers a run.
  async fetch(_request, env) {
    const ok = Boolean(env.GITHUB_TOKEN);
    return new Response(
      `capsule-cron: dispatches ${env.WORKFLOW} on ${env.REPO} on a schedule. Token ${ok ? "set" : "MISSING: run setup"}.\n`,
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  },
};

async function dispatch(env, cron) {
  const repo = env.REPO || "CyberSecDigestDaily/capsule";
  const workflow = env.WORKFLOW || "update.yml";
  const token = (env.GITHUB_TOKEN || "").trim();
  if (!token) {
    console.log("GITHUB_TOKEN secret missing");
    return alert(env, "capsule-cron has no GITHUB_TOKEN secret, so no runs are being started. Run the setup again (cloudflare/setup.cmd).");
  }
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`;
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "capsule-cron",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: env.REF || "main" }),
    });
    if (res.status === 204) {
      console.log(`dispatched ${workflow} (cron ${cron})`);
      return;
    }
    last = `${res.status} ${(await res.text()).slice(0, 200)}`;
    console.log(`dispatch attempt ${attempt} failed: ${last}`);
    if ([401, 403, 404, 422].includes(res.status)) break; // retrying won't help
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  const hint = last.startsWith("401")
    ? " The GitHub token has expired or been revoked: make a new one and run the setup again (cloudflare/setup.cmd)."
    : "";
  await alert(env, `capsule-cron couldn't start the price check (${last.split(" ")[0]}).${hint}`);
}

async function alert(env, msg) {
  if (!env.DISCORD_WEBHOOK) return;
  try {
    await fetch(env.DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `🔴 ${msg}` }),
    });
  } catch (e) {
    console.log(`discord alert failed: ${e}`);
  }
}
