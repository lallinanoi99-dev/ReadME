// /app — read repo → facts → draft → edit → export → stamp.
import { marked } from "https://cdn.jsdelivr.net/npm/marked@14.1.3/+esm";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3.1.7/+esm";
import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/+esm";
import { CONFIG, STYLES } from "./config.js";
import { $, $$, copyText, download, esc, load, normalizeMd, save, sha256Hex, shortAddr, timeAgo, toast } from "./util.js";
import { onRate, parseRepo, rate, readRepo, RepoError } from "./github.js";
import { extractFacts, stackLine } from "./facts.js";
import {
  BADGES, STYLE_INDEX, applyBadges, badgesMarkdown, defaultBadges, joinSections, keyForHeading,
  scoreReadme, splitSections, templateReadme, templateSection,
} from "./readme.js";
import { explorerTx, hasContract, onWallet, reader, wallet, writer } from "./chain.js";

marked.setOptions({ gfm: true, breaks: false });

const S = {
  step: "start",
  facts: null,
  commit: "",
  uf: null,
  style: "detailed",
  badges: [],
  md: "",
  sections: [],
  mode: "ai",
  drawer: "sections",
  mobilePane: "preview",
  busy: new Set(),
};
let root;
let editor;
let sortable;
let mounted = false;
let readToken = 0;

// ================= mount =================
export function mount(el) {
  root = el;
  if (!mounted) {
    root.innerHTML = `
      <div class="app">
        <aside class="app-side" aria-label="Your READMEs">
          <button class="btn btn-primary side-new" id="side-new">＋ New README</button>
          <div class="side-h">Recents</div>
          <ul class="side-list" id="side-recents"></ul>
          <div class="side-h">My stamps</div>
          <ul class="side-list" id="side-stamps"></ul>
          <div class="side-rate" id="side-rate"></div>
        </aside>
        <section class="app-main" id="app-main"></section>
      </div>
      <div class="modal" id="stamp-modal" hidden><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="stamp-title"></div></div>`;
    $("#side-new").onclick = () => window.rmgNavigate("/app");
    onRate(renderRate);
    onWallet(() => {
      renderStamps();
      if (S.step === "editor") renderBar();
    });
    mounted = true;
  }
  renderRecents();
  renderStamps();

  const params = new URLSearchParams(location.search);
  const style = params.get("style");
  if (STYLES.some((s) => s.id === style)) S.style = style;
  const repo = params.get("repo");
  if (repo) startRead(repo);
  else showStart();
}

// ================= sidebar =================
function renderRate(r) {
  const el = $("#side-rate");
  if (!el) return;
  el.innerHTML =
    r.remaining === null
      ? `<span class="muted">GitHub: 60 calls/hour</span>`
      : `<div class="rate-bar"><i style="width:${(r.remaining / r.limit) * 100}%"></i></div><span class="${r.remaining < 10 ? "warn" : "muted"}">GitHub: ${r.remaining}/${r.limit} calls left</span>`;
}

function history() {
  return load("rmg:history", []);
}
function saveHistory() {
  if (!S.facts) return;
  const list = history().filter((h) => h.full !== S.facts.full);
  list.unshift({ full: S.facts.full, facts: S.facts, commit: S.commit, uf: S.uf, style: S.style, badges: S.badges, md: S.md, mode: S.mode, updatedAt: Date.now() });
  save("rmg:history", list.slice(0, 20));
  renderRecents();
}
function renderRecents() {
  const ul = $("#side-recents");
  if (!ul) return;
  const list = history();
  ul.innerHTML = list.length
    ? list.map((h, i) => `<li><button data-i="${i}" class="${S.facts?.full === h.full ? "on" : ""}"><span class="mono">${esc(h.full.split("/")[1])}</span><small>${timeAgo(h.updatedAt)}</small></button></li>`).join("")
    : `<li class="side-empty">No READMEs yet</li>`;
  $$("button", ul).forEach((b) =>
    b.addEventListener("click", () => {
      const h = history()[+b.dataset.i];
      Object.assign(S, { facts: h.facts, commit: h.commit, uf: h.uf, style: h.style, badges: h.badges, md: h.md, mode: h.mode || "ai" });
      history().length && window.history.replaceState(null, "", `/app?repo=${encodeURIComponent(h.full)}&resume=1`);
      showEditor();
    }),
  );
}

async function renderStamps() {
  const ul = $("#side-stamps");
  if (!ul) return;
  const local = load("rmg:stamps", []);
  let chain = [];
  if (wallet.address && hasContract()) {
    try {
      const c = reader();
      const ids = (await c.stampsOf(wallet.address)).slice(-10).reverse();
      chain = await Promise.all(ids.map(async (id) => ({ full: (await c.getStamp(id)).repo, id: Number(id) })));
    } catch {
      /* rpc down */
    }
  }
  const seen = new Set();
  const all = [...chain, ...local].filter((s) => !seen.has(s.full.toLowerCase()) && seen.add(s.full.toLowerCase()));
  ul.innerHTML = all.length
    ? all.slice(0, 10).map((s) => `<li><a href="/r/${esc(s.full)}" data-link><span class="ok">✓</span> <span class="mono">${esc(s.full.split("/")[1])}</span></a></li>`).join("")
    : `<li class="side-empty">${wallet.address ? "No stamps yet" : "Connect a wallet to see stamps"}</li>`;
}

// ================= step 1 · start =================
function showStart(error) {
  S.step = "start";
  const main = $("#app-main");
  main.innerHTML = `
    <div class="step-wrap">
      <p class="step-n mono">Step 1 of 4</p>
      <h1 class="step-h">Paste a repo</h1>
      <p class="muted">Any public GitHub repo. The default branch is used.</p>
      <form class="repo-form big" id="start-form" autocomplete="off">
        <span class="repo-prefix mono">github.com/</span>
        <input name="repo" class="mono" placeholder="owner/repo" aria-label="GitHub repository" spellcheck="false" required />
        <button class="btn btn-primary" type="submit">Read my repo</button>
      </form>
      ${error ? `<div class="alert ${error.code === "rate" ? "warn" : "err"}" role="alert">${esc(error.message)}</div>` : ""}
      <div class="start-hints">
        <span class="muted">Try:</span>
        ${["scaffold-eth/scaffold-eth-2", "markedjs/marked", "transmissions11/solmate"].map((r) => `<button class="chip mono" data-r="${r}">${r}</button>`).join("")}
      </div>
    </div>`;
  const form = $("#start-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    go(form.repo.value);
  });
  $$(".start-hints .chip").forEach((b) => (b.onclick = () => go(b.dataset.r)));
  if (error?.input) form.repo.value = error.input;
  form.repo.focus();
}

function go(input) {
  const p = parseRepo(input);
  if (!p) return showStart({ code: "invalid", message: "That doesn't look like a GitHub repo. Use owner/repo or a github.com link.", input });
  window.history.pushState(null, "", `/app?repo=${encodeURIComponent(p.full)}${S.style !== "detailed" ? `&style=${S.style}` : ""}`);
  startRead(p.full);
}

// ================= step 2 · reading =================
const READ_STEPS = [
  ["meta", "Repo info"],
  ["tree", "File tree"],
  ["pkg", "package.json"],
  ["sol", "Solidity files"],
  ["html", "index.html + config"],
  ["readme", "Existing README"],
];

async function startRead(input, force = false) {
  const p = parseRepo(input);
  if (!p) return showStart({ code: "invalid", message: "That doesn't look like a GitHub repo. Use owner/repo or a github.com link.", input });
  const params = new URLSearchParams(location.search);
  if (params.get("resume")) {
    const h = history().find((x) => x.full.toLowerCase() === p.full.toLowerCase());
    if (h) {
      Object.assign(S, { facts: h.facts, commit: h.commit, uf: h.uf, style: h.style, badges: h.badges, md: h.md, mode: h.mode || "ai" });
      return showEditor();
    }
  }
  const token = ++readToken;
  S.step = "reading";
  const main = $("#app-main");
  main.innerHTML = `
    <div class="step-wrap">
      <p class="step-n mono">Step 2 of 4</p>
      <h1 class="step-h">Reading <span class="mono green">${esc(p.full)}</span></h1>
      <ul class="checklist" id="checklist">
        ${READ_STEPS.map(([id, label]) => `<li data-id="${id}" class="wait"><span class="ck"></span><span>${label}</span><small></small></li>`).join("")}
      </ul>
      <div id="detected"></div>
    </div>`;
  const steps = $("#checklist");
  if (window.gsap) gsap.from("#checklist li", { opacity: 0, x: -12, stagger: 0.06, duration: 0.3 });

  const onStep = (id, state, detail = "") => {
    if (token !== readToken) return;
    if (id === "cache") {
      $$("li", steps).forEach((li) => (li.className = "done"));
      steps.insertAdjacentHTML("beforeend", `<li class="note">${esc(detail)} · <button class="linkish" id="reread">Read again</button></li>`);
      $("#reread").onclick = () => startRead(p.full, true);
      return;
    }
    const li = $(`li[data-id="${id}"]`, steps);
    if (!li) return;
    li.className = state;
    $("small", li).textContent = detail;
  };

  try {
    const data = await readRepo(p.owner, p.repo, onStep, { force });
    if (token !== readToken) return;
    S.facts = extractFacts(data);
    S.commit = data.commit;
    S.uf = null;
    const f = S.facts;
    $("#detected").innerHTML = `
      <div class="detected">
        <span class="muted">Detected:</span> <strong>${esc(stackLine(f))}</strong>
        ${f.contracts.length ? `<div class="muted small">Contracts: ${f.contracts.map((c) => `<code>${esc(c.name)}</code>`).join(", ")}</div>` : ""}
        ${f.truncated ? `<div class="alert warn">Huge repo — read only key files and the top-level tree.</div>` : ""}
      </div>
      <button class="btn btn-primary" id="to-facts">Continue →</button>`;
    if (window.gsap) gsap.from(".detected, #to-facts", { opacity: 0, y: 10, duration: 0.4, stagger: 0.1 });
    $("#to-facts").onclick = showFacts;
    $("#to-facts").focus();
  } catch (e) {
    if (token !== readToken) return;
    showStart(e instanceof RepoError ? { ...e, message: e.message, code: e.code, input: p.full } : { code: "err", message: "Something went wrong reading the repo.", input: p.full });
  }
}

// ================= step 3+4 · facts + style =================
function defaultUf(f) {
  return {
    name: f.name,
    tagline: f.description,
    liveUrl: f.homepage,
    contracts: f.addresses.length ? f.addresses.map((a) => ({ address: a, network: "677" })) : [{ address: "", network: "677" }],
    xUrl: f.links.x,
    videoUrl: f.links.video,
    license: f.license && f.license !== "See LICENSE" ? f.license : "",
    screenshots: [],
    roadmap: "",
  };
}

const LICENSES = ["", "MIT", "Apache-2.0", "GPL-3.0", "BSD-3-Clause", "MPL-2.0", "Unlicense", "UNLICENSED"];

function factsFormHTML(uf, compact = false) {
  const lic = LICENSES.includes(uf.license) ? LICENSES : [...LICENSES, uf.license];
  return `
    <div class="field-grid ${compact ? "compact" : ""}">
      <label class="field"><span>Project name</span><input name="name" value="${esc(uf.name)}" /></label>
      <label class="field"><span>One-line tagline</span><input name="tagline" value="${esc(uf.tagline)}" placeholder="What it does, in one sentence" /></label>
      <label class="field"><span>Live URL</span><input name="liveUrl" value="${esc(uf.liveUrl)}" placeholder="https://" inputmode="url" /></label>
      <label class="field"><span>Demo video</span><input name="videoUrl" value="${esc(uf.videoUrl)}" placeholder="YouTube / Loom link" inputmode="url" /></label>
      <label class="field"><span>X / Twitter</span><input name="xUrl" value="${esc(uf.xUrl)}" placeholder="https://x.com/…" inputmode="url" /></label>
      <label class="field"><span>License</span><select name="license">${lic.map((l) => `<option ${l === uf.license ? "selected" : ""} value="${esc(l)}">${l || "— detect / none —"}</option>`).join("")}</select></label>
      <div class="field full"><span>Contract address(es)</span>
        <div id="contract-rows">${uf.contracts.map((c, i) => contractRow(c, i)).join("")}</div>
        <button type="button" class="linkish" id="add-contract">＋ Add another</button>
      </div>
      <label class="field full"><span>Screenshots <small class="muted">(image URLs, one per line)</small></span><textarea name="screenshots" rows="2" placeholder="https://…/screenshot.png">${esc(uf.screenshots.join("\n"))}</textarea></label>
      <label class="field full"><span>Roadmap <small class="muted">(optional — one item per line)</small></span><textarea name="roadmap" rows="2">${esc(uf.roadmap)}</textarea></label>
    </div>`;
}
function contractRow(c, i) {
  return `<div class="contract-row" data-i="${i}">
    <input class="mono" name="caddr" value="${esc(c.address)}" placeholder="0x…" spellcheck="false" />
    <select name="cnet"><option value="677" ${c.network === "677" ? "selected" : ""}>BOT Chain mainnet · 677</option><option value="968" ${c.network === "968" ? "selected" : ""}>BOT Chain testnet · 968</option></select>
  </div>`;
}
function readUf(form) {
  const v = (n) => (form.elements[n]?.value || "").trim();
  const addrs = $$('[name="caddr"]', form).map((i) => i.value.trim());
  const nets = $$('[name="cnet"]', form).map((s) => s.value);
  return {
    name: v("name"),
    tagline: v("tagline"),
    liveUrl: v("liveUrl"),
    videoUrl: v("videoUrl"),
    xUrl: v("xUrl"),
    license: v("license"),
    contracts: addrs.map((a, i) => ({ address: /^0x[a-fA-F0-9]{40}$/.test(a) ? a : "", network: nets[i] })).filter((c, i) => c.address || i === 0),
    screenshots: v("screenshots").split(/\s+/).filter((u) => /^https?:\/\//.test(u)),
    roadmap: v("roadmap"),
  };
}
function wireContractRows(form) {
  $("#add-contract", form).onclick = () => {
    const rows = $("#contract-rows", form);
    if (rows.children.length >= 3) return;
    rows.insertAdjacentHTML("beforeend", contractRow({ address: "", network: "677" }, rows.children.length));
  };
}

function showFacts() {
  S.step = "facts";
  S.uf ??= defaultUf(S.facts);
  const f = S.facts;
  $("#app-main").innerHTML = `
    <form class="step-wrap wide" id="facts-form">
      <p class="step-n mono">Step 3 of 4</p>
      <h1 class="step-h">Add the facts code can't see</h1>
      <p class="muted">Prefilled where found in <span class="mono">${esc(f.full)}</span>. Leave blanks — they become TODOs.</p>
      ${factsFormHTML(S.uf)}
      <h2 class="sub-h">Pick a style</h2>
      <div class="style-cards" role="radiogroup">
        ${STYLES.map((s) => `<label class="style-card"><input type="radio" name="style" value="${s.id}" ${S.style === s.id ? "checked" : ""} /><strong>${s.label}</strong><span>${s.hint}</span></label>`).join("")}
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" id="back-start">← Different repo</button>
        <button class="btn btn-primary btn-lg" type="submit">Write my README</button>
      </div>
    </form>`;
  const form = $("#facts-form");
  wireContractRows(form);
  $("#back-start").onclick = () => window.rmgNavigate("/app");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    S.uf = readUf(form);
    S.style = form.elements.style.value;
    S.badges = defaultBadges(S.facts, S.uf);
    draftAll();
  });
}

// ================= draft =================
const proofUrl = () => `${location.origin}/r/${S.facts.full}`;
const badgeLine = () => badgesMarkdown(S.badges, S.facts, S.uf, CONFIG.WORKER_URL, proofUrl());

async function draftAll() {
  S.step = "drafting";
  $("#app-main").innerHTML = `
    <div class="step-wrap">
      <p class="step-n mono">Step 4 of 4</p>
      <h1 class="step-h">Writing your README <span class="writing-pill"><span class="pulse"></span> Writing…</span></h1>
      <div class="skeleton paper">${Array.from({ length: 8 }, (_, i) => `<i style="width:${[60, 90, 75, 40, 85, 70, 55, 80][i]}%"></i>`).join("")}</div>
    </div>`;
  let md = "";
  S.mode = "ai";
  if (CONFIG.WORKER_URL) {
    try {
      md = await callWorker("/readme/draft", { facts: compactFacts(), userFacts: S.uf, style: S.style, badges: badgeLine() });
      md = applyBadges(md, badgeLine());
    } catch (e) {
      md = "";
      toast(e.status === 429 ? "AI is busy — using the template for now." : "AI unavailable — using a template filled with your repo facts.", true);
    }
  }
  if (!md) {
    S.mode = "template";
    md = templateReadme(S.facts, S.uf, S.style, badgeLine());
  }
  S.md = md;
  showEditor();
  saveHistory();
}

function compactFacts() {
  const f = { ...S.facts };
  if (f.existingReadme) f.existingReadme = { ...f.existingReadme, excerpt: f.existingReadme.excerpt.slice(0, 1200) };
  return f;
}

async function callWorker(path, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(CONFIG.WORKER_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = new Error("worker " + res.status);
      err.status = res.status;
      throw err;
    }
    const { markdown } = await res.json();
    if (!markdown) throw new Error("empty");
    return markdown.trim() + "\n";
  } finally {
    clearTimeout(t);
  }
}

// ================= editor =================
async function showEditor() {
  S.step = "editor";
  const f = S.facts;
  $("#app-main").innerHTML = `
    <div class="ed" data-pane="${S.mobilePane}">
      <div class="ed-top">
        <a class="chip mono repo-chip" href="https://github.com/${esc(f.full)}" target="_blank" rel="noopener">⎇ ${esc(f.full)}${S.commit ? ` <span class="muted">@${S.commit.slice(0, 7)}</span>` : ""}</a>
        <div class="tabs slim" role="tablist" id="style-tabs">
          ${STYLES.map((s) => `<button class="tab" role="tab" aria-selected="${s.id === S.style}" data-s="${s.id}">${s.label}</button>`).join("")}
        </div>
        <span class="mode-pill ${S.mode}" title="${S.mode === "ai" ? "Drafted by AI from repo facts" : "AI unavailable — template filled with detected facts"}">${S.mode === "ai" ? "AI draft" : "Template draft"}</span>
        <div class="pane-switch" role="tablist" aria-label="View">
          <button data-p="editor" aria-selected="${S.mobilePane === "editor"}">Edit</button>
          <button data-p="preview" aria-selected="${S.mobilePane === "preview"}">Preview</button>
        </div>
      </div>
      <div class="ed-body">
        <div class="ed-pane ed-editor"><div class="pane-h mono">README.md</div><div id="cm" class="cm-host"></div></div>
        <div class="ed-pane ed-preview"><div class="pane-h mono">Preview</div><div class="preview-scroll"><article class="markdown-body paper" id="preview"></article></div></div>
        <aside class="ed-drawer">
          <div class="drawer-tabs" role="tablist">
            ${[["sections", "Sections"], ["badges", "Badges"], ["facts", "Facts"], ["score", "Score"]].map(([k, l]) => `<button role="tab" data-d="${k}" aria-selected="${S.drawer === k}">${l}</button>`).join("")}
          </div>
          <div class="drawer-body" id="drawer"></div>
        </aside>
      </div>
      <div class="ed-bar" id="ed-bar"></div>
    </div>`;

  $$("#style-tabs .tab").forEach((b) => (b.onclick = () => changeStyle(b.dataset.s)));
  $$(".pane-switch button").forEach(
    (b) =>
      (b.onclick = () => {
        S.mobilePane = b.dataset.p;
        $(".ed").dataset.pane = S.mobilePane;
        $$(".pane-switch button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      }),
  );
  $$(".drawer-tabs button").forEach(
    (b) =>
      (b.onclick = () => {
        S.drawer = b.dataset.d;
        $$(".drawer-tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
        renderDrawer();
      }),
  );

  editor = await makeEditor($("#cm"), S.md, (text) => {
    S.md = text;
    refresh(false);
  });
  refresh(true);
  if (window.gsap) gsap.from(".ed-pane, .ed-drawer", { opacity: 0, y: 12, stagger: 0.06, duration: 0.4, clearProps: "all" });
}

let saveTimer;
function refresh(full) {
  S.sections = splitSections(S.md);
  $("#preview").innerHTML = DOMPurify.sanitize(marked.parse(S.md), { ADD_ATTR: ["target"] });
  $$("#preview a").forEach((a) => a.setAttribute("target", "_blank"));
  if (full || S.drawer !== "facts") renderDrawer();
  renderBar();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveHistory, 800);
}

function setMd(md) {
  S.md = md;
  editor.set(md);
  refresh(true);
}

async function makeEditor(parent, doc, onChange) {
  let silent = false;
  try {
    const [{ EditorView, basicSetup }, { markdown }, { oneDark }] = await Promise.all([
      import("https://esm.sh/codemirror@6.0.1"),
      import("https://esm.sh/@codemirror/lang-markdown@6.3.1"),
      import("https://esm.sh/@codemirror/theme-one-dark@6.1.2"),
    ]);
    let timer;
    const view = new EditorView({
      doc,
      parent,
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        EditorView.lineWrapping,
        EditorView.theme({ "&": { height: "100%", backgroundColor: "#0c0e10" }, ".cm-gutters": { backgroundColor: "#0c0e10" } }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged || silent) return;
          clearTimeout(timer);
          timer = setTimeout(() => onChange(view.state.doc.toString()), 180);
        }),
      ],
    });
    return {
      set(text) {
        silent = true;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
        silent = false;
      },
    };
  } catch {
    const ta = document.createElement("textarea");
    ta.className = "md-textarea mono";
    ta.value = doc;
    ta.spellcheck = false;
    parent.appendChild(ta);
    let timer;
    ta.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => onChange(ta.value), 180);
    });
    return { set: (t) => (ta.value = t) };
  }
}

function changeStyle(style) {
  if (style === S.style) return;
  if (!confirm(`Re-draft in ${STYLES.find((s) => s.id === style).label} style? Your edits will be replaced.`)) {
    $$("#style-tabs .tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.s === S.style)));
    return;
  }
  S.style = style;
  draftAll();
}

// ---------- drawer ----------
function renderDrawer() {
  const d = $("#drawer");
  if (!d) return;
  sortable?.destroy();
  sortable = null;
  if (S.drawer === "sections") {
    d.innerHTML = `
      <p class="drawer-note">Drag to reorder. Each section can be redone on its own.</p>
      <ul class="sec-list" id="sec-list">
        ${S.sections
          .map(
            (s) => `<li data-id="${s.id}" class="${s.heading ? "" : "locked"} ${S.busy.has(s.id) ? "busy" : ""}">
            <span class="handle" aria-hidden="true">${s.heading ? "⋮⋮" : "#"}</span>
            <span class="sec-name">${esc(s.heading || "Title & intro")}</span>
            <span class="sec-acts">
              <button data-a="regen" title="Regenerate" aria-label="Regenerate ${esc(s.heading || "intro")}">↻</button>
              <button data-a="short" title="Shorter" aria-label="Make ${esc(s.heading || "intro")} shorter">Shorter</button>
              ${s.heading ? `<button data-a="del" title="Delete" aria-label="Delete ${esc(s.heading)}">✕</button>` : ""}
            </span></li>`,
          )
          .join("")}
      </ul>
      <button class="btn btn-ghost btn-sm full" id="add-sec">＋ Add a missing section</button>`;
    sortable = Sortable.create($("#sec-list"), {
      handle: ".handle",
      filter: ".locked",
      animation: 160,
      onMove: (e) => !e.related.classList.contains("locked"),
      onEnd: () => {
        const order = $$("#sec-list li").map((li) => li.dataset.id);
        const secs = order.map((id) => S.sections.find((s) => s.id === id));
        setMd(joinSections(secs));
      },
    });
    $$("#sec-list button").forEach((b) => (b.onclick = () => sectionAction(b.closest("li").dataset.id, b.dataset.a)));
    $("#add-sec").onclick = addMissingSection;
  } else if (S.drawer === "badges") {
    d.innerHTML = `
      <p class="drawer-note">shields.io badges, placed under the title.</p>
      <div class="badge-list">
        ${BADGES.map((b) => {
          const disabled = (b.id === "demo" && !S.uf.liveUrl) || (b.id === "documented" && !load("rmg:stamps", []).some((s) => s.full === S.facts.full));
          return `<label class="check ${disabled ? "disabled" : ""}"><input type="checkbox" value="${b.id}" ${S.badges.includes(b.id) ? "checked" : ""} ${disabled ? "disabled" : ""}/> ${b.label}${
            disabled ? `<small>${b.id === "demo" ? "add a live URL first" : "stamp first"}</small>` : ""
          }</label>`;
        }).join("")}
      </div>`;
    $$(".badge-list input").forEach(
      (i) =>
        (i.onchange = () => {
          S.badges = $$(".badge-list input:checked").map((x) => x.value);
          setMd(applyBadges(S.md, badgeLine()));
        }),
    );
  } else if (S.drawer === "facts") {
    const f = S.facts;
    d.innerHTML = `
      <div class="facts-detected">
        <div class="kv"><span>Stack</span><div>${[...f.stack, ...f.tools].map((s) => `<span class="chip chip-stack">${esc(s)}</span>`).join(" ") || "—"}</div></div>
        <div class="kv"><span>Scripts</span><div class="mono small">${Object.keys(f.scripts).map(esc).join(", ") || "—"}</div></div>
        <div class="kv"><span>Contracts</span><div class="mono small">${f.contracts.map((c) => `${esc(c.name)} (${c.functions.length} fn)`).join(", ") || "—"}</div></div>
        ${f.envVars.length ? `<div class="kv"><span>Env vars</span><div class="mono small">${f.envVars.map(esc).join(", ")}</div></div>` : ""}
      </div>
      <form id="drawer-facts">${factsFormHTML(S.uf, true)}<button class="btn btn-ghost btn-sm full" type="submit">Save facts</button><p class="drawer-note">Then ↻ the sections you want updated.</p></form>`;
    const form = $("#drawer-facts");
    wireContractRows(form);
    form.onsubmit = (e) => {
      e.preventDefault();
      S.uf = readUf(form);
      setMd(applyBadges(S.md, badgeLine()));
      toast("Facts saved");
    };
  } else {
    const sc = scoreReadme(S.md, S.facts);
    d.innerHTML = `
      <div class="score-big"><b>${sc.passed}</b><span>/ ${sc.total}</span></div>
      <ul class="score-list">${sc.checks.map(([l, ok]) => `<li class="${ok ? "ok" : "no"}">${l}</li>`).join("")}</ul>
      ${sc.todos ? `<p class="drawer-note amber">${sc.todos} TODO${sc.todos > 1 ? "s" : ""} left — search for "TODO" in the editor.</p>` : ""}`;
  }
}

function addMissingSection() {
  const have = new Set(S.sections.map((s) => keyForHeading(s.heading)).filter(Boolean));
  const keys = ["demo", "what", "features", "how", "stack", "contract", "start", "structure", "roadmap", "license", "credits", "submission"];
  const key = keys.find((k) => !have.has(k) && templateSection(k, S.facts, S.uf, S.style));
  if (!key) return toast("All sections are already there.");
  setMd(joinSections([...S.sections, { text: templateSection(key, S.facts, S.uf, S.style) }]));
  toast(`Added "${templateSection(key, S.facts, S.uf, S.style).split("\n")[0].replace(/^##\s+/, "")}"`);
}

async function sectionAction(id, action) {
  const sec = S.sections.find((s) => s.id === id);
  if (!sec || S.busy.has(id)) return;
  if (action === "del") {
    setMd(joinSections(S.sections.filter((s) => s.id !== id)));
    return;
  }
  S.busy.add(id);
  renderDrawer();
  let text = "";
  try {
    if (CONFIG.WORKER_URL) {
      text = await callWorker("/readme/section", {
        facts: compactFacts(),
        userFacts: S.uf,
        style: S.style,
        section: sec.text,
        mode: action === "short" ? "shorter" : "regenerate",
      });
      if (!sec.heading) text = applyBadges(text, badgeLine());
    }
  } catch {
    toast("AI unavailable — used the template instead.", true);
  }
  if (!text) {
    if (action === "short") text = shorter(sec.text);
    else {
      const key = keyForHeading(sec.heading);
      text = key ? templateSection(key, S.facts, S.uf, S.style, badgeLine()) : sec.text;
      if (!key) toast("No template for this custom section — kept it as is.");
    }
  }
  S.busy.delete(id);
  // the section list may have changed while waiting; replace by id
  const current = splitSections(S.md);
  const idx = S.sections.findIndex((s) => s.id === id);
  if (idx >= 0 && current[idx]) current[idx] = { ...current[idx], text: text.trim() };
  setMd(joinSections(current));
}

// Offline "shorter": keep the heading and the first half of the blocks; trim long lists and tables.
function shorter(text) {
  const lines = text.split("\n");
  const head = /^##\s/.test(lines[0]) ? lines.shift() : null;
  if (!head) return text; // title & intro is already short
  const blocks = [];
  let cur = [];
  let fence = false;
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (!fence && !l.trim()) {
      if (cur.length) blocks.push(cur), (cur = []);
      continue;
    }
    cur.push(l);
  }
  if (cur.length) blocks.push(cur);
  const kept = blocks.slice(0, Math.max(1, Math.ceil(blocks.length / 2))).map((b) => {
    if (b.every((l) => /^\s*([-*]|\d+\.)\s/.test(l))) return b.slice(0, 4);
    if (/^\|/.test(b[0])) return b.slice(0, 5);
    return b;
  });
  return [head, ...kept.map((b) => b.join("\n"))].join("\n\n");
}

// ---------- bottom bar: export + stamp ----------
function renderBar() {
  const bar = $("#ed-bar");
  if (!bar) return;
  const sc = scoreReadme(S.md, S.facts);
  const stamped = load("rmg:stamps", []).find((s) => s.full === S.facts.full);
  bar.innerHTML = `
    <div class="bar-left">
      <button class="btn btn-ghost btn-sm" id="b-copy">Copy Markdown</button>
      <button class="btn btn-ghost btn-sm hide-sm" id="b-dl">Download README.md</button>
      <button class="btn btn-ghost btn-sm hide-sm" id="b-gh">Open GitHub editor ↗</button>
      <button class="score-pill" id="b-score" title="README score">Score ${sc.passed}/${sc.total}${sc.todos ? ` · <span class="amber">${sc.todos} TODO</span>` : ""}</button>
    </div>
    <div class="bar-right">
      ${stamped ? `<a class="linkish hide-sm" href="/r/${esc(S.facts.full)}" data-link>Proof page →</a>` : ""}
      <button class="btn btn-primary btn-sm" id="b-stamp">Stamp on BOT Chain</button>
    </div>`;
  $("#b-copy").onclick = () => copyText(normalizeMd(S.md), "Markdown copied");
  $("#b-dl").onclick = () => download("README.md", normalizeMd(S.md));
  $("#b-gh").onclick = () => {
    copyText(normalizeMd(S.md), "Copied — paste it in the GitHub editor");
    const f = S.facts;
    const url = f.existingReadme
      ? `https://github.com/${f.full}/edit/${encodeURIComponent(f.branch)}/README.md`
      : `https://github.com/${f.full}/new/${encodeURIComponent(f.branch)}?filename=README.md`;
    window.open(url, "_blank", "noopener");
  };
  $("#b-score").onclick = () => $('.drawer-tabs [data-d="score"]').click();
  $("#b-stamp").onclick = stamp;
}

async function stamp() {
  if (!hasContract()) return toast("Stamping opens once the contract address is set in js/config.js.", true);
  if (!/^[0-9a-f]{40}$/i.test(S.commit)) return toast("Missing commit SHA — read the repo again.", true);
  const md = normalizeMd(S.md);
  const hash = await sha256Hex(md);
  const repo = S.facts.full.toLowerCase();
  openModal("pending-wallet", { hash });
  let c;
  try {
    c = await writer();
  } catch {
    c = null;
  }
  if (!c) return openModal("failed", { message: window.ethereum ? "Wallet not connected or wrong network." : "MetaMask is needed to stamp. Everything else works without it." });
  try {
    const tx = await c.stamp(repo, "0x" + S.commit, hash, STYLE_INDEX[S.style]);
    openModal("pending-tx", { hash, tx: tx.hash });
    const rc = await tx.wait();
    let id = null;
    for (const log of rc.logs) {
      try {
        const p = c.interface.parseLog(log);
        if (p?.name === "Stamped") id = Number(p.args.id);
      } catch {
        /* other logs */
      }
    }
    const stamps = load("rmg:stamps", []).filter((s) => s.full !== S.facts.full);
    stamps.unshift({ full: S.facts.full, id, tx: tx.hash, hash, at: Date.now() });
    save("rmg:stamps", stamps.slice(0, 50));
    if (!S.badges.includes("documented") && CONFIG.WORKER_URL) {
      S.badges.push("documented");
      setMd(applyBadges(S.md, badgeLine()));
    }
    renderStamps();
    renderBar();
    openModal("done", { hash, tx: tx.hash, id });
  } catch (e) {
    if (e?.code === "ACTION_REJECTED" || e?.info?.error?.code === 4001) openModal("failed", { message: "Transaction rejected in the wallet.", retry: true });
    else openModal("failed", { message: e?.shortMessage || "Transaction failed.", retry: true });
  }
}

function openModal(state, d) {
  const m = $("#stamp-modal");
  const card = $(".modal-card", m);
  const proof = proofUrl();
  const badgeImg = CONFIG.WORKER_URL
    ? `${CONFIG.WORKER_URL}/badge.svg?repo=${encodeURIComponent(S.facts.full.toLowerCase())}`
    : "https://img.shields.io/badge/Documented%20on-BOT%20Chain-3FB950";
  const badgeMd = `[![Documented on BOT Chain](${badgeImg})](${proof})`;
  const body = {
    "pending-wallet": `<h2 id="stamp-title">Confirm in your wallet</h2><p class="muted">Saving <span class="mono">${esc(S.facts.full)}</span> @ <span class="mono">${S.commit.slice(0, 7)}</span> and fingerprint <span class="mono">${d.hash.slice(0, 10)}…</span></p><div class="spinner"></div>`,
    "pending-tx": `<h2 id="stamp-title">Stamping…</h2><p class="muted">Waiting for BOT Chain to confirm.</p><div class="spinner"></div><a class="linkish" href="${explorerTx(d.tx)}" target="_blank" rel="noopener">View transaction ↗</a>`,
    done: `<div class="stamp-ok">Stamped ✓</div><h2 id="stamp-title">Documented on BOT Chain</h2>
      <p class="muted">Paste this exact README into your repo so the proof page shows <strong>✓ Matches</strong>.</p>
      <div class="kv"><span>Proof page</span><a class="linkish mono" href="/r/${esc(S.facts.full)}" data-link>${esc(proof)}</a></div>
      <div class="kv"><span>Badge</span><code class="code-box">${esc(badgeMd)}</code></div>
      <div class="modal-actions"><button class="btn btn-ghost btn-sm" id="m-badge">Copy badge</button><button class="btn btn-ghost btn-sm" id="m-md">Copy README</button><a class="btn btn-ghost btn-sm" href="${explorerTx(d.tx)}" target="_blank" rel="noopener">Transaction ↗</a><button class="btn btn-primary btn-sm" id="m-close">Done</button></div>`,
    failed: `<h2 id="stamp-title">Not stamped</h2><p class="muted">${esc(d.message)}</p><div class="modal-actions"><button class="btn btn-ghost btn-sm" id="m-close">Close</button>${d.retry ? `<button class="btn btn-primary btn-sm" id="m-retry">Retry</button>` : ""}</div>`,
  }[state];
  card.innerHTML = body;
  m.hidden = false;
  const close = () => (m.hidden = true);
  $("#m-close", card) && ($("#m-close", card).onclick = close);
  $("#m-retry", card) && ($("#m-retry", card).onclick = () => (close(), stamp()));
  $("#m-badge", card) && ($("#m-badge", card).onclick = () => copyText(badgeMd, "Badge copied"));
  $("#m-md", card) && ($("#m-md", card).onclick = () => copyText(normalizeMd(S.md), "README copied"));
  m.onclick = (e) => e.target === m && (state === "done" || state === "failed") && close();
  card.querySelector("a[data-link]")?.addEventListener("click", close);
}
