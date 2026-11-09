// Homepage: content rendering + GSAP animations.
import { BEFORE_AFTER, EXAMPLES } from "./config.js";
import { $, $$, esc, reducedMotion } from "./util.js";
import { recentStamps } from "./chain.js";

const { gsap } = window;
const hasGsap = !!gsap;
if (hasGsap) gsap.registerPlugin(ScrollTrigger, SplitText, TextPlugin, Flip);

let built = false;
let ctx;

export function mount() {
  if (!built) {
    build();
    built = true;
  }
  if (!hasGsap) return;
  ctx?.revert();
  ctx = gsap.context(animate);
  requestAnimationFrame(() => ScrollTrigger.refresh());
}
export function unmount() {
  ctx?.revert();
  ctx = null;
}

// ---------------- content ----------------
const CAPS = {
  Read: {
    icon: "⌕",
    title: "Reads the repo the way a reviewer would",
    text: "File tree, package.json, Solidity, config and your old README — straight from GitHub's public API, in your browser.",
    cards: [
      ["File tree", "Every file, plus the top two levels for the structure section."],
      ["package.json", "Frameworks, ethers / web3 and the real npm scripts for <code>Getting started</code>."],
      ["Solidity", "Up to 3 <code>.sol</code> files: contract names and public functions."],
      ["Config + meta", "<code>hardhat.config</code>, <code>foundry.toml</code>, <code>index.html</code> title, <code>.env.example</code> names."],
    ],
  },
  Write: {
    icon: "✎",
    title: "Writes from facts, in the style you pick",
    text: "Code collects the facts. The AI only turns them into readable Markdown — Minimal, Detailed or Hackathon.",
    cards: [
      ["Facts first", "The draft only uses what was detected or what you typed."],
      ["3 styles", "Same facts, different depth."],
      ["TODOs, not guesses", "Anything missing becomes a <code>TODO:</code> line."],
      ["Template fallback", "AI down? You still get a README filled with the detected facts."],
    ],
  },
  Edit: {
    icon: "⇅",
    title: "Edit side by side with a GitHub preview",
    text: "Markdown on the left, the page as GitHub shows it on the right. Every section has its own tools.",
    cards: [
      ["Split view", "CodeMirror editor and live preview."],
      ["Per-section tools", "Regenerate, make shorter or delete any section."],
      ["Drag to reorder", "Move sections without copy-pasting."],
      ["README score", "Demo link, setup steps, contract link, screenshots."],
    ],
  },
  Badge: {
    icon: "◇",
    title: "Badges that say what matters",
    text: "Pick from shields.io badges. The BOT Chain badge links straight to your contract on the explorer.",
    cards: [
      ["License + language", "Read straight from your repo."],
      ["Live demo", "A green badge linking to your deployed site."],
      ["BOT Chain mainnet", "Network badge linked to your contract."],
      ["Documented ✓", "After stamping: a badge with the stamp date."],
    ],
  },
  Stamp: {
    icon: "✓",
    title: "Stamp the version on BOT Chain",
    text: "One transaction saves the repo, the latest commit and the README fingerprint. Anyone can check it later.",
    cards: [
      ["One transaction", "Repo, commit SHA and fingerprint, on chain 677."],
      ["SHA-256 fingerprint", "Any change to the README changes it."],
      ["Proof page", "<code>/r/owner/repo</code> shows who stamped it and when."],
      ["Match check", "Today's README vs the stamp: ✓ Matches or ⚠ Changed."],
    ],
  },
};

const CLOUD = [
  ["## Getting started", "hl"], ["npm run dev"], ["![demo](…)"], ["MIT"], ["TODO: add screenshots", "td"],
  ["## Smart contract", "hl"], ["chain 677"], ["```bash"], ["function vote(uint256 id)"], ["## Features"],
  ["npm install"], ["[Live demo](…)", "hl"], ["## Tech stack"], ["ethers.js"], ["contracts/"], ["TODO: demo video", "td"],
];

const FLIP_SECTIONS = {
  minimal: ["# Title", "## What it does", "## Getting started", "## License"],
  detailed: ["# Title", "## What it does", "## Features", "## How it works", "## Getting started", "## License"],
  hackathon: ["# Title", "## Live demo", "## What it does", "## Smart contract", "## Getting started"],
};

const DEMOS = [
  {
    repo: "your-name/vote-dapp",
    h1: "vote-dapp",
    tag: "Create a poll, share the link, count votes on BOT Chain.",
    s: [
      ["What it does", "Anyone can open a poll and vote once per wallet. Results live on-chain."],
      ["Smart contract", "VoteBox · BOT Chain mainnet (677) · createPoll() · vote() · results()"],
      ["Getting started", "npm install\nnpm run dev"],
    ],
  },
  {
    repo: "your-name/token-tools",
    h1: "token-tools",
    tag: "Small helpers for ERC-20 balances and transfers.",
    s: [
      ["Features", "Check balances · send tokens · TODO: list the main things a user can do"],
      ["Tech stack", "Solidity · Hardhat · ethers.js"],
      ["Getting started", "npm install\nnpx hardhat compile"],
    ],
  },
  {
    repo: "your-name/portfolio-site",
    h1: "portfolio-site",
    tag: "My projects, on GitHub Pages.",
    s: [
      ["Demo", "Live: TODO: add the live URL"],
      ["Tech stack", "HTML · CSS · GSAP · GitHub Pages"],
      ["Project structure", "├── assets/\n├── css/\n└── index.html"],
    ],
  },
];

function build() {
  // hero form
  $("#hero-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = e.target.repo.value.trim();
    window.rmgNavigate(`/app${v ? `?repo=${encodeURIComponent(v)}` : ""}`);
  });

  // capabilities pills
  const tabs = $("#caps-tabs");
  tabs.innerHTML = Object.entries(CAPS)
    .map(([k, v], i) => `<button class="pill" role="tab" aria-selected="${i === 0}" data-k="${k}"><span class="pi">${v.icon}</span>${k}</button>`)
    .join("");
  const renderCaps = (k, animate) => {
    const c = CAPS[k];
    $("#caps-title").textContent = c.title;
    $("#caps-text").textContent = c.text;
    const grid = $("#caps-grid");
    const state = animate && hasGsap && !reducedMotion() ? Flip.getState(".cap-card") : null;
    grid.innerHTML = c.cards
      .map(([h, p], i) => `<article class="cap-card" data-flip-id="c${i}"><span class="num">0${i + 1} · ${k}</span><h3>${h}</h3><p>${p}</p></article>`)
      .join("");
    if (state) {
      Flip.from(state, { duration: 0.5, ease: "power2.inOut" });
      gsap.from(".cap-card h3, .cap-card p, #caps-title, #caps-text", { opacity: 0, y: 6, stagger: 0.025, duration: 0.3 });
    }
  };
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest(".pill");
    if (!b) return;
    $$(".pill", tabs).forEach((t) => t.setAttribute("aria-selected", String(t === b)));
    renderCaps(b.dataset.k, true);
  });
  arrowKeys(tabs, ".pill");
  renderCaps("Read");

  // keyword cloud
  // 4 columns x 4 rows, nudged so it doesn't look like a grid
  $("#cloud").innerHTML = CLOUD.map(([t, c], i) => {
    const x = 3 + (i % 4) * 24 + ((i * 7) % 5);
    const y = 8 + Math.floor(i / 4) * 22 + ((i * 3) % 4);
    const size = 11 + ((i * 7) % 3);
    return `<span class="${c || ""}" style="left:${x}%;top:${y}%;font-size:${size}px">${esc(t)}</span>`;
  }).join("");

  // flip mini readme
  const renderFlip = (s) => {
    const box = $("#flip-readme");
    const state = hasGsap && box.children.length && !reducedMotion() ? Flip.getState("#flip-readme div") : null;
    box.innerHTML = FLIP_SECTIONS[s].map((t) => `<div data-flip-id="${t}">${esc(t)}</div>`).join("");
    if (state) Flip.from(state, { duration: 0.45, ease: "power2.inOut", onEnter: (els) => gsap.fromTo(els, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.3 }) });
  };
  $("#flip-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $$("#flip-tabs button").forEach((x) => x.classList.toggle("on", x === b));
    renderFlip(b.dataset.s);
  });
  renderFlip("detailed");

  // statement: split into words for the scroll reveal
  const st = $("#statement");
  st.innerHTML = st.textContent.split(" ").map((w) => `<span class="w">${esc(w)}</span>`).join(" ");

  buildRow();
  buildBeforeAfter();
  buildGallery();
  buildStrip();
}

function arrowKeys(list, sel) {
  list.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const all = $$(sel, list);
    const i = all.indexOf(document.activeElement);
    if (i < 0) return;
    const n = all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
    n.focus();
    n.click();
  });
}

// generic slider for a track of equal-width children
function slider(track, viewport, prev, next, onChange) {
  let i = 0;
  const n = track.children.length;
  const go = (d) => {
    const visible = Math.max(1, Math.floor(viewport.clientWidth / track.children[0].getBoundingClientRect().width));
    const max = Math.max(0, n - visible);
    i = Math.min(max, Math.max(0, i + d));
    const x = -track.children[i].offsetLeft;
    if (hasGsap && !reducedMotion()) gsap.to(track, { x, duration: 0.6, ease: "power3.inOut" });
    else track.style.transform = `translateX(${x}px)`;
    prev.disabled = i === 0;
    next.disabled = i === max;
    onChange?.(i);
  };
  prev.onclick = () => go(-1);
  next.onclick = () => go(1);
  viewport.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  });
  window.addEventListener("resize", () => go(0));
  go(0);
}

function buildRow() {
  slider($("#ft-track"), $("#ft-viewport"), $("#ft-prev"), $("#ft-next"));
}

function buildBeforeAfter() {
  const track = $("#ba-track");
  track.innerHTML = BEFORE_AFTER.map(
    (s) => `<div class="ba-slide" role="group" aria-label="${esc(s.repo)}">
      <div class="ba-big"><b data-count="${s.stats.sectionsAfter}">0</b><span>sections, up from ${s.stats.sectionsBefore} · <span class="mono">${esc(s.repo)}</span></span>${s.label ? `<span class="tag-sample">${esc(s.label)}</span>` : ""}</div>
      <div class="ba-cols">
        <div class="ba-col"><h4>Before</h4><pre>${esc(s.before)}</pre></div>
        <div class="ba-col after"><h4>After · ReadMeGen</h4><pre>${esc(s.after)}</pre></div>
        <div class="ba-stats">
          <div class="stat"><b data-count="${s.stats.setupSteps}">0</b><span>real setup commands</span></div>
          <div class="stat amber"><b data-count="${s.stats.todos}">0</b><span>TODOs left for you</span></div>
          <div class="stat"><b>0</b><span>invented claims</span></div>
        </div>
      </div></div>`,
  ).join("");
  const n = BEFORE_AFTER.length;
  slider(track, $("#ba-viewport"), $("#ba-prev"), $("#ba-next"), (i) => {
    $("#ba-count").textContent = `${i + 1} / ${n}`;
    countUp($$(".ba-slide")[i]);
  });
}

function countUp(root) {
  if (!root) return;
  $$("[data-count]", root).forEach((b) => {
    const to = +b.dataset.count;
    if (!hasGsap || reducedMotion()) return (b.textContent = to);
    const o = { v: 0 };
    gsap.to(o, { v: to, duration: 1, ease: "power2.out", onUpdate: () => (b.textContent = Math.round(o.v)) });
  });
}

function buildGallery() {
  const cats = ["All", "Hackathon", "Library", "App", "Smart contract"];
  const tabs = $("#ex-tabs");
  tabs.innerHTML = cats.map((c, i) => `<button class="pill" role="tab" aria-selected="${i === 0}" data-c="${c}">${c}</button>`).join("");
  const render = (c) => {
    const items = EXAMPLES.filter((e) => c === "All" || e.cat === c);
    $("#ex-grid").innerHTML = items
      .map(
        (e) => `<a class="ex-card" href="/app?repo=${encodeURIComponent(e.repo)}" data-link>
        <div class="ex-thumb"><div class="ex-paper"><b>${esc(e.repo.split("/")[1])}</b><div class="mini-line w80"></div><div class="mini-line w60"></div><div class="mini-line w70"></div></div></div>
        <div class="ex-body"><span class="ex-cat">${esc(e.cat)}</span><h3>${esc(e.repo)}</h3><p>${esc(e.blurb)}</p><span class="go">Try it →</span></div></a>`,
      )
      .join("");
    if (hasGsap && !reducedMotion()) gsap.from("#ex-grid .ex-card", { opacity: 0, y: 14, stagger: 0.04, duration: 0.4, clearProps: "all" });
  };
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest(".pill");
    if (!b) return;
    $$(".pill", tabs).forEach((t) => t.setAttribute("aria-selected", String(t === b)));
    render(b.dataset.c);
  });
  arrowKeys(tabs, ".pill");
  render("All");
}

async function buildStrip() {
  const track = $("#marquee-track");
  let names = [];
  try {
    names = [...new Set((await recentStamps(20)).map((s) => s.repo))];
  } catch {
    /* RPC unavailable */
  }
  if (!names.length) {
    track.innerHTML = `<span class="marquee-empty">Stamps show up here live from BOT Chain — <a href="/app" data-link>be the first →</a></span>`;
    track.dataset.static = "1";
    return;
  }
  const items = names.map((n) => `<a class="marquee-item" href="/r/${esc(n)}" data-link>${esc(n)}</a>`).join("");
  track.innerHTML = items + items; // duplicated for a seamless loop
  ctx?.add(() => startMarquee());
}

function startMarquee() {
  const track = $("#marquee-track");
  if (reducedMotion() || track.dataset.static || !track.children.length) return;
  gsap.to(track, { xPercent: -50, ease: "none", duration: track.children.length * 2.2, repeat: -1 });
}

// ---------------- animations ----------------
function animate() {
  const rm = reducedMotion();

  if (!rm) {
    // hero
    const split = new SplitText("#hero-title .hl", { type: "words", mask: "words" });
    gsap.from(split.words, { yPercent: 110, duration: 0.9, ease: "power4.out", stagger: 0.035 });
    gsap.from("#rot", { yPercent: 110, opacity: 0, duration: 0.9, ease: "power4.out", delay: 0.3 });
    gsap.from(".hero-sub, .repo-form, .hero .hero-ctas", { opacity: 0, y: 14, duration: 0.7, stagger: 0.08, delay: 0.35, ease: "power2.out" });
    rotateWord();
  }

  const stopDemo = demo(rm);
  startMarquee();

  if (!rm) {
    // keyword cloud drift
    $$("#cloud span").forEach((s, i) => {
      gsap.to(s, {
        x: gsap.utils.random(-30, 30), y: gsap.utils.random(-14, 14),
        duration: gsap.utils.random(4, 7), ease: "sine.inOut", repeat: -1, yoyo: true, delay: i * 0.1,
      });
    });
    // statement word-by-word reveal tied to scroll
    gsap.to("#statement .w", {
      color: "#E9ECEF", stagger: 0.1, ease: "none",
      scrollTrigger: { trigger: ".statement", start: "top 70%", end: "bottom 60%", scrub: true },
    });
    // section reveals
    $$(".blk-head, .cells, .row-viewport, .ba-viewport, .ex-grid, .cta > *").forEach((el) => {
      gsap.from(el, { opacity: 0, y: 24, duration: 0.7, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 90%", once: true } });
    });
    // gauge fill
    gsap.from(".gauge-arc", { attr: { "stroke-dashoffset": 100 }, duration: 1.4, ease: "power2.out", scrollTrigger: { trigger: ".gauge", start: "top 85%", once: true } });
    // TODO cards float
    $$(".todo-card").forEach((c, i) => gsap.to(c, { y: i % 2 ? 6 : -6, duration: 2.6 + i * 0.3, ease: "sine.inOut", repeat: -1, yoyo: true }));
  }

  ScrollTrigger.create({ trigger: ".ba", start: "top 70%", once: true, onEnter: () => countUp($$(".ba-slide")[0]) });
  if (rm) countUp(document);
  return () => stopDemo?.();
}

function rotateWord() {
  const el = $("#rot");
  const words = ["actually read.", "trust.", "star."];
  let i = 0;
  const tl = gsap.timeline({ repeat: -1, delay: 3 });
  words.forEach(() => {
    tl.to(el, { yPercent: -100, opacity: 0, duration: 0.35, ease: "power2.in", delay: 2.6 })
      .call(() => {
        i = (i + 1) % words.length;
        el.textContent = words[i];
      })
      .fromTo(el, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.45, ease: "power3.out" });
  });
}

// Demo window: chat-style run — prompt → working → steps → README writes itself → stamped.
function demo(rm) {
  const status = $("#dw-status");
  const statusText = $("#dw-status-text");
  const secs = $("#dw-secs");
  let timer;
  let tl;

  const fill = (d) => {
    $("#dw-title").textContent = d.h1;
    $("#dw-typed").textContent = `github.com/${d.repo}`;
    $("#dw-h1").textContent = d.h1;
    $("#dw-tag").textContent = d.tag;
    ["#dw-s1", "#dw-s2", "#dw-s3"].forEach((id, i) => {
      $(`${id} h4`).textContent = d.s[i][0];
      $(`${id} p, ${id} pre`).textContent = d.s[i][1];
    });
    gsap.set("#dw-stamp, #dw-steps .dw-step, #dw-badges i", { opacity: 1 });
    status.classList.add("done");
    statusText.textContent = "Stamped on BOT Chain";
    secs.textContent = "";
  };

  const run = (d) => {
    tl?.kill();
    clearInterval(timer);
    if (rm) return fill(d);
    $("#dw-title").textContent = d.h1;
    tl = gsap.timeline({ defaults: { ease: "power2.out" }, onComplete: () => clearInterval(timer) });
    tl.call(() => {
      status.classList.remove("done");
      statusText.textContent = "Working";
      $("#dw-typed").textContent = "";
      ["#dw-h1", "#dw-tag", "#dw-s1 h4", "#dw-s1 p", "#dw-s2 h4", "#dw-s2 p", "#dw-s3 h4", "#dw-s3 pre"].forEach((s) => ($(s).textContent = ""));
      let n = 1;
      secs.textContent = "1s";
      clearInterval(timer);
      timer = setInterval(() => (secs.textContent = `${++n}s`), 1000);
    })
      .set("#dw-steps .dw-step, #dw-badges i", { opacity: 0 })
      .set("#dw-stamp", { opacity: 0, y: -40, scale: 1.4 })
      .to("#dw-typed", { duration: 1, text: `github.com/${d.repo}`, ease: "none" })
      .fromTo("#dw-steps .dw-step", { opacity: 0, y: 6 }, { opacity: 1, y: 0, stagger: 0.45, duration: 0.3 }, "+=0.3")
      .call(() => (statusText.textContent = "Writing README"))
      .to("#dw-h1", { duration: 0.4, text: d.h1, ease: "none" })
      .to("#dw-tag", { duration: 0.8, text: d.tag, ease: "none" })
      .to("#dw-badges i", { opacity: 1, stagger: 0.08, duration: 0.2 });
    d.s.forEach((s, i) => {
      tl.to(`#dw-s${i + 1} h4`, { duration: 0.3, text: s[0], ease: "none" }).to(`#dw-s${i + 1} ${i === 2 ? "pre" : "p"}`, { duration: 0.8, text: s[1], ease: "none" });
    });
    tl.call(() => (statusText.textContent = "Stamping on BOT Chain"))
      .to("#dw-stamp", { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(2)" }, "+=0.5")
      .call(() => {
        clearInterval(timer);
        status.classList.add("done");
        statusText.textContent = "Stamped on BOT Chain";
        secs.textContent = "";
      });
    return tl;
  };

  // Recents switch the demo, like the reference
  let current = 0;
  $$("#dw-recents li").forEach(
    (li) =>
      (li.onclick = () => {
        current = +li.dataset.i;
        $$("#dw-recents li").forEach((x) => x.classList.toggle("on", x === li));
        run(DEMOS[current]);
      }),
  );

  if (rm) return fill(DEMOS[0]);
  ScrollTrigger.create({
    trigger: "#demo",
    start: "top 75%",
    once: true,
    onEnter: () => run(DEMOS[current]),
  });
  return () => {
    tl?.kill();
    clearInterval(timer);
  };
}
