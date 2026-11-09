// ReadMeGen routes for the shared Week 1 Cloudflare Worker.
//   POST /readme/draft    facts + user facts + style -> Markdown
//   POST /readme/section  regenerate / shorten one section
//   GET  /badge.svg?repo= "Documented on BOT Chain" badge with the stamp date
// Repo content is never logged.

import Anthropic from "@anthropic-ai/sdk";
import { Contract, JsonRpcProvider } from "ethers";

const MODEL = "claude-opus-5-5";
const STAMP_ABI = [
  "function latestForRepo(string repo) view returns (uint256 id, tuple(address by, string repo, bytes20 commit, bytes32 readmeHash, uint8 style, uint64 at) s)",
];
const STYLES = ["minimal", "detailed", "hackathon"];
const MAX_BODY = 200_000; // bytes

const RULES = `You write README.md files for GitHub repositories.
Hard rules:
- Use ONLY the facts provided in the JSON. Never invent features, commands, numbers, users, awards, URLs, contract addresses or benchmarks.
- Where information a reader would expect is missing, write a short line starting with "TODO:" so the author can fill it in.
- Commands in "Getting started" must come from the detected package.json scripts (e.g. "npm run dev"). If there are none, write a TODO.
- Smart contract section: list contract names and public functions exactly as given, with the explorer link if an address is provided.
- Project structure: render the given tree as a fenced code block.
- Output GitHub-flavoured Markdown only, no preamble and no closing remarks. Do not wrap the whole answer in a code fence.
- Each top-level section starts with "## ". The document starts with "# <project name>".`;

const STYLE_GUIDE = {
  minimal:
    "Style: Minimal. Short and clean. Title + tagline, badges, one-paragraph what it does, a short features list, getting started, license. Skip sections with no facts.",
  detailed:
    "Style: Detailed. Full docs: title + tagline, badges, demo/screenshot, what it does, features, how it works, tech stack, smart contract, getting started, project structure, roadmap (only if provided), license, credits.",
  hackathon:
    "Style: Hackathon (BOT Chain submission checklist). Order: title + tagline, badges, live demo + video links, what it does, how it works, smart contract (network, address, explorer link, main functions), tech stack, getting started, project structure, submission links, license.",
};

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      if (url.pathname === "/badge.svg" && request.method === "GET") return badge(url, env);

      if (!cors["Access-Control-Allow-Origin"]) return json({ error: "Origin not allowed" }, 403, cors);

      if (request.method === "POST" && (url.pathname === "/readme/draft" || url.pathname === "/readme/section")) {
        const limited = await rateLimit(request, env);
        if (limited) return json({ error: "Too many requests — try again in a minute." }, 429, cors);

        const raw = await request.text();
        if (raw.length > MAX_BODY) return json({ error: "Request too large" }, 413, cors);
        const body = JSON.parse(raw);

        const markdown =
          url.pathname === "/readme/draft" ? await draft(body, env) : await section(body, env);
        return json({ markdown }, 200, cors);
      }
      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      // Log only the error type, never the repo content.
      console.error("readme worker error:", err?.name || "Error", err?.status || "");
      const status = err instanceof Anthropic.RateLimitError ? 429 : 502;
      return json({ error: "AI unavailable", code: err?.name || "Error" }, status, cors);
    }
  },
};

async function draft(body, env) {
  const style = STYLES.includes(body.style) ? body.style : "detailed";
  const prompt = `${STYLE_GUIDE[style]}

Repository facts (detected from code):
${JSON.stringify(body.facts ?? {}, null, 2)}

Facts from the author:
${JSON.stringify(body.userFacts ?? {}, null, 2)}

Badges Markdown to place directly under the title (use exactly as given):
${body.badges ?? ""}

Write the full README now.`;
  return ask(env, prompt, 12000);
}

async function section(body, env) {
  const mode = body.mode === "shorter" ? "shorter" : "regenerate";
  const style = STYLES.includes(body.style) ? body.style : "detailed";
  const prompt = `${STYLE_GUIDE[style]}

Repository facts:
${JSON.stringify(body.facts ?? {}, null, 2)}

Facts from the author:
${JSON.stringify(body.userFacts ?? {}, null, 2)}

Current section:
${String(body.section ?? "").slice(0, 20000)}

${
  mode === "shorter"
    ? "Rewrite this section to be about half as long. Keep the same heading and every fact that matters."
    : "Rewrite this section from the facts. Keep the same heading. Make it clearer and more useful."
}
Return only the section Markdown, starting with its heading.`;
  return ask(env, prompt, 4000);
}

async function ask(env, prompt, maxTokens) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: RULES,
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    const e = new Error("refused");
    e.name = "Refusal";
    throw e;
  }
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return text.replace(/^```(?:markdown|md)?\n([\s\S]*)\n```$/, "$1");
}

// ---------- badge ----------
async function badge(url, env) {
  const repo = (url.searchParams.get("repo") || "").toLowerCase().slice(0, 100);
  let right = "not stamped";
  let color = "#8B929A";
  if (repo && env.CONTRACT_ADDRESS) {
    try {
      const provider = new JsonRpcProvider(env.RPC_URL || "https://rpc.botchain.ai", 677, { staticNetwork: true });
      const c = new Contract(env.CONTRACT_ADDRESS, STAMP_ABI, provider);
      const [, s] = await c.latestForRepo(repo);
      right = new Date(Number(s.at) * 1000).toISOString().slice(0, 10);
      color = "#3FB950";
    } catch {
      /* no stamps yet */
    }
  }
  return new Response(badgeSvg("Documented on BOT Chain", right, color), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function badgeSvg(left, right, color) {
  const w = (s) => Math.round(s.length * 6.6 + 14);
  const lw = w(left) + 16;
  const rw = w(right);
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${esc(left)}: ${esc(right)}">
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${lw + rw}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#111315"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><rect width="${lw + rw}" height="20" fill="url(#s)"/></g>
<g fill="#fff" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="7" y="14" font-weight="bold">#</text>
<text x="${16 + (lw - 16) / 2}" y="14" text-anchor="middle">${esc(left)}</text>
<text x="${lw + rw / 2}" y="14" text-anchor="middle">${esc(right)}</text></g></svg>`;
}

// ---------- helpers ----------
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    ...(ok ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// 20 AI calls per IP per 10 minutes. Uses KV when bound, otherwise in-memory per isolate.
const memoryHits = new Map();
async function rateLimit(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  const windowKey = `rl:${ip}:${Math.floor(Date.now() / 600_000)}`;
  const limit = Number(env.RATE_LIMIT || 20);
  if (env.RATE_KV) {
    const n = Number((await env.RATE_KV.get(windowKey)) || 0) + 1;
    await env.RATE_KV.put(windowKey, String(n), { expirationTtl: 700 });
    return n > limit;
  }
  const n = (memoryHits.get(windowKey) || 0) + 1;
  memoryHits.set(windowKey, n);
  if (memoryHits.size > 5000) memoryHits.clear();
  return n > limit;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
