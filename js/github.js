// Reads a public GitHub repo from the browser (public API + raw files).
import { load, save } from "./util.js";

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const CACHE_MS = 60 * 60 * 1000;

export const rate = { remaining: null, limit: 60, reset: null };
const rateListeners = new Set();
export const onRate = (fn) => (rateListeners.add(fn), fn(rate));

export class RepoError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function parseRepo(input) {
  const s = String(input || "").trim()
    .replace(/^git@github\.com:/i, "")
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/[?#].*$/, "");
  const m = s.match(/^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], full: `${m[1]}/${m[2]}` };
}

async function api(path) {
  let res;
  try {
    res = await fetch(API + path, { headers: { Accept: "application/vnd.github+json" } });
  } catch {
    throw new RepoError("network", "Can't reach GitHub. Check your connection.");
  }
  const rem = res.headers.get("x-ratelimit-remaining");
  if (rem !== null) {
    rate.remaining = +rem;
    rate.limit = +(res.headers.get("x-ratelimit-limit") || 60);
    rate.reset = +(res.headers.get("x-ratelimit-reset") || 0) * 1000;
    rateListeners.forEach((fn) => fn(rate));
  }
  if (res.ok) return res.json();
  if ((res.status === 403 || res.status === 429) && rate.remaining === 0) {
    const mins = Math.max(1, Math.ceil((rate.reset - Date.now()) / 60000));
    throw new RepoError("rate", `GitHub needs a break — try in ${mins} minute${mins > 1 ? "s" : ""}. Cached repos still work.`);
  }
  if (res.status === 404) throw new RepoError("notfound", "Repo not found — or it's private. ReadMeGen reads public repos only.");
  if (res.status === 409) throw new RepoError("empty", "Nothing to read yet — this repo is empty.");
  throw new RepoError("http", `GitHub returned ${res.status}.`);
}

async function raw(owner, repo, branch, path, maxBytes = 30_000) {
  try {
    const res = await fetch(`${RAW}/${owner}/${repo}/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`);
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  } catch {
    return null;
  }
}

export async function fetchCurrentReadme(owner, repo) {
  for (const name of ["README.md", "readme.md", "Readme.md", "README.MD"]) {
    try {
      const res = await fetch(`${RAW}/${owner}/${repo}/HEAD/${name}`, { cache: "no-store" });
      if (res.ok) return res.text();
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Read a repo. onStep(id, state, detail) drives the checklist UI.
 * Returns { meta, tree, truncated, commit, files } — files maps path -> text.
 */
export async function readRepo(owner, repo, onStep = () => {}, { force = false } = {}) {
  const key = `rmg:repo:${owner}/${repo}`.toLowerCase();
  const cached = load(key, null);
  if (!force && cached && Date.now() - cached.at < CACHE_MS) {
    onStep("cache", "done", "Using cached read (less than 1 hour old)");
    return cached.data;
  }

  onStep("meta", "busy");
  const m = await api(`/repos/${owner}/${repo}`);
  if (m.private) throw new RepoError("notfound", "This repo is private. ReadMeGen reads public repos only.");
  const meta = {
    owner: m.owner.login,
    repo: m.name,
    full: m.full_name,
    branch: m.default_branch,
    description: m.description || "",
    homepage: m.homepage || "",
    language: m.language || "",
    license: m.license?.spdx_id && m.license.spdx_id !== "NOASSERTION" ? m.license.spdx_id : "",
    topics: m.topics || [],
    stars: m.stargazers_count,
    hasPages: !!m.has_pages,
    size: m.size,
  };
  onStep("meta", "done", meta.full);

  onStep("tree", "busy");
  const [t, br] = await Promise.all([
    api(`/repos/${meta.owner}/${meta.repo}/git/trees/${encodeURIComponent(meta.branch)}?recursive=1`),
    api(`/repos/${meta.owner}/${meta.repo}/branches/${encodeURIComponent(meta.branch)}`),
  ]);
  const tree = (t.tree || []).map((n) => ({ path: n.path, type: n.type, size: n.size || 0 }));
  if (!tree.length) throw new RepoError("empty", "Nothing to read yet — this repo is empty.");
  const commit = br?.commit?.sha || "";
  onStep("tree", "done", `${tree.filter((n) => n.type === "blob").length} files${t.truncated ? " (huge repo — reading key files only)" : ""}`);

  // pick key files
  const blobs = tree.filter((n) => n.type === "blob" && !/(^|\/)(node_modules|lib|dist|build|out|vendor|\.git)\//.test(n.path));
  const byDepth = (a, b) => a.path.split("/").length - b.path.split("/").length;
  const pick = (re) => blobs.filter((n) => re.test(n.path)).sort(byDepth);
  const pkg = pick(/(^|\/)package\.json$/)[0];
  const readme = pick(/(^|\/)readme(\.[a-z]+)?$/i)[0];
  const sols = pick(/\.sol$/i).filter((n) => !/(^|\/)(test|tests|mocks?|script)\//i.test(n.path) && n.size <= 30_000).slice(0, 3);
  const html = pick(/(^|\/)index\.html?$/i)[0];
  const configs = pick(/(^|\/)(hardhat\.config\.(js|ts|cjs|mjs)|foundry\.toml)$/i).slice(0, 2);
  const env = pick(/(^|\/)\.env\.(example|sample|template)$/i)[0];

  const files = {};
  const get = async (n) => n && (files[n.path] = await raw(meta.owner, meta.repo, meta.branch, n.path));

  onStep("pkg", "busy");
  await get(pkg);
  onStep("pkg", pkg ? "done" : "skip", pkg ? pkg.path : "no package.json");

  onStep("sol", "busy");
  await Promise.all(sols.map(get));
  onStep("sol", sols.length ? "done" : "skip", sols.length ? `${sols.length} Solidity file${sols.length > 1 ? "s" : ""}` : "no Solidity files");

  onStep("html", "busy");
  await Promise.all([get(html), ...configs.map(get), get(env)]);
  onStep("html", html ? "done" : "skip", html ? html.path : "no index.html");

  onStep("readme", "busy");
  await get(readme);
  onStep("readme", readme ? "done" : "skip", readme ? readme.path : "no README yet");

  const data = { meta, tree: tree.slice(0, 4000), truncated: !!t.truncated, commit, files, readAt: Date.now() };
  save(key, { at: Date.now(), data });
  return data;
}
