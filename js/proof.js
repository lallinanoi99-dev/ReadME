// /r/:owner/:repo — public proof page for a stamped README.
import { CONFIG, STYLES } from "./config.js";
import { $, copyText, esc, normalizeMd, sha256Hex, shortAddr } from "./util.js";
import { explorerAddress, hasContract, reader } from "./chain.js";
import { fetchCurrentReadme } from "./github.js";

export async function mount(el, owner, repo) {
  const full = `${owner}/${repo}`;
  const key = full.toLowerCase();
  const proof = `${location.origin}/r/${full}`;
  const badgeImg = CONFIG.WORKER_URL
    ? `${CONFIG.WORKER_URL}/badge.svg?repo=${encodeURIComponent(key)}`
    : "https://img.shields.io/badge/Documented%20on-BOT%20Chain-3FB950";
  const badgeMd = `[![Documented on BOT Chain](${badgeImg})](${proof})`;

  el.innerHTML = `
    <section class="proof wrap">
      <p class="mono muted">Proof of documentation</p>
      <h1 class="proof-h"><a href="https://github.com/${esc(full)}" target="_blank" rel="noopener">${esc(full)}</a></h1>
      <div class="proof-grid">
        <div class="proof-card" id="proof-main"><div class="spinner"></div><p class="muted">Reading BOT Chain…</p></div>
        <aside class="proof-side">
          <div class="proof-card">
            <h3>Badge</h3>
            <p class="muted small">Paste into your README.</p>
            <code class="code-box">${esc(badgeMd)}</code>
            <button class="btn btn-ghost btn-sm" id="copy-badge">Copy badge Markdown</button>
          </div>
          <div class="proof-card">
            <h3>History</h3>
            <ul class="history" id="proof-history"><li class="muted">—</li></ul>
          </div>
        </aside>
      </div>
    </section>`;
  $("#copy-badge").onclick = () => copyText(badgeMd, "Badge copied");

  const main = $("#proof-main");
  if (!hasContract()) {
    main.innerHTML = `<p class="muted">The ReadMeGen contract isn't configured yet.</p>`;
    return;
  }
  const c = reader();
  let id, s;
  try {
    [id, s] = await c.latestForRepo(key);
  } catch {
    main.innerHTML = `<h2>Not stamped yet</h2><p class="muted">Nobody has stamped a README for this repo.</p><a class="btn btn-primary" href="/app?repo=${encodeURIComponent(full)}" data-link>Write and stamp one</a>`;
    return;
  }

  const date = new Date(Number(s.at) * 1000);
  const commit = s.commit.slice(2);
  main.innerHTML = `
    <div class="match" id="match"><span class="spinner sm"></span> Checking today's README…</div>
    <dl class="proof-dl">
      <dt>Stamped by</dt><dd><a class="mono" href="${explorerAddress(s.by)}" target="_blank" rel="noopener">${shortAddr(s.by)}</a></dd>
      <dt>When</dt><dd>${date.toLocaleString()}</dd>
      <dt>Commit</dt><dd><a class="mono" href="https://github.com/${esc(full)}/commit/${commit}" target="_blank" rel="noopener">${commit.slice(0, 7)}</a></dd>
      <dt>Style</dt><dd>${STYLES[Number(s.style)]?.label || "—"}</dd>
      <dt>Fingerprint</dt><dd class="mono small break">${s.readmeHash}</dd>
      <dt>Stamp #</dt><dd class="mono">${Number(id)}</dd>
    </dl>
    <a class="btn btn-ghost btn-sm" href="${explorerAddress(CONFIG.CONTRACT_ADDRESS)}" target="_blank" rel="noopener">View contract on explorer ↗</a>`;

  // compare with the README in the repo today
  const current = await fetchCurrentReadme(owner, repo);
  const m = $("#match");
  if (!current) {
    m.className = "match warn";
    m.textContent = "⚠ No README found in the repo today";
  } else {
    const h = await sha256Hex(normalizeMd(current));
    const ok = h.toLowerCase() === s.readmeHash.toLowerCase();
    m.className = `match ${ok ? "ok" : "warn"}`;
    m.innerHTML = ok ? "✓ Matches — the README in the repo is the stamped version" : "⚠ Changed since — the README in the repo differs from the stamp";
  }

  // history
  try {
    const ids = (await c.historyForRepo(key)).slice(-10).reverse();
    const list = await Promise.all(ids.map((i) => c.getStamp(i)));
    $("#proof-history").innerHTML = list
      .map((x, i) => `<li><span class="mono">#${Number(ids[i])}</span> <span>${new Date(Number(x.at) * 1000).toLocaleDateString()}</span> <a class="mono" href="${explorerAddress(x.by)}" target="_blank" rel="noopener">${shortAddr(x.by)}</a></li>`)
      .join("");
  } catch {
    /* keep placeholder */
  }
}
