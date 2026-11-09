// Entry: router, nav, footer.
import { CONFIG, NET } from "./config.js";
import { $, $$, copyText, shortAddr } from "./util.js";
import { explorerAddress, hasContract, initWallet, reader } from "./chain.js";

const views = { home: "#view-home", app: "#view-app", proof: "#view-proof", notfound: "#view-404" };
let homeMod, appMod, proofMod;

function show(name) {
  Object.entries(views).forEach(([k, sel]) => ($(sel).hidden = k !== name));
  document.body.dataset.view = name;
}

async function route() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  window.ScrollTrigger?.getAll().forEach((t) => t.disable(false));

  if (path === "/") {
    show("home");
    homeMod ??= await import("./home.js");
    homeMod.mount();
    if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
    else window.scrollTo(0, 0);
  } else if (path === "/app") {
    homeMod?.unmount();
    show("app");
    appMod ??= await import("./app.js");
    appMod.mount($("#view-app"));
    window.scrollTo(0, 0);
  } else if (path.startsWith("/r/")) {
    homeMod?.unmount();
    show("proof");
    const [, , owner, repo] = path.split("/");
    proofMod ??= await import("./proof.js");
    proofMod.mount($("#view-proof"), owner, repo);
    window.scrollTo(0, 0);
  } else if (path === "/privacy" || path === "/terms") {
    homeMod?.unmount();
    show("proof");
    $("#view-proof").innerHTML = path === "/privacy" ? PRIVACY : TERMS;
    window.scrollTo(0, 0);
  } else {
    homeMod?.unmount();
    show("notfound");
  }
  document.title =
    path === "/app" ? "Write a README — ReadMeGen" : path.startsWith("/r/") ? `Proof · ${path.slice(3)} — ReadMeGen` : "ReadMeGen — Paste a repo, get a great README";
}

export function navigate(href) {
  const u = new URL(href, location.origin);
  if (u.origin !== location.origin) return (location.href = href);
  const samePath = u.pathname === location.pathname;
  history.pushState(null, "", u.pathname + u.search + u.hash);
  if (samePath && u.hash) return document.getElementById(u.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
  route();
}
window.rmgNavigate = navigate;

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-link]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") return;
  e.preventDefault();
  closeMenus();
  navigate(a.getAttribute("href"));
});
window.addEventListener("popstate", route);

// ---------- nav ----------
const mega = $(".mega");
const megaBtn = $(".mega-btn");
function closeMenus() {
  mega.classList.remove("open");
  megaBtn.setAttribute("aria-expanded", "false");
  $("#nav-mobile").classList.remove("open");
  $("#burger").setAttribute("aria-expanded", "false");
}
megaBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = !mega.classList.contains("open");
  mega.classList.toggle("open", open);
  megaBtn.setAttribute("aria-expanded", String(open));
});
mega.addEventListener("mouseenter", () => matchMedia("(hover:hover)").matches && mega.classList.add("open"));
mega.addEventListener("mouseleave", () => mega.classList.remove("open"));
document.addEventListener("click", (e) => !e.target.closest(".mega") && mega.classList.remove("open"));
document.addEventListener("keydown", (e) => e.key === "Escape" && closeMenus());
$("#burger").addEventListener("click", () => {
  const open = !$("#nav-mobile").classList.contains("open");
  $("#nav-mobile").classList.toggle("open", open);
  $("#burger").setAttribute("aria-expanded", String(open));
});
window.addEventListener("scroll", () => $("#nav").classList.toggle("scrolled", scrollY > 8), { passive: true });

// ---------- footer ----------
function initFooter() {
  const addr = CONFIG.CONTRACT_ADDRESS;
  $("#ft-gh").href = CONFIG.PROJECT_GITHUB;
  $("#ft-x").href = CONFIG.PROJECT_X;
  $("#ft-bcdocs").href = CONFIG.BOTCHAIN_DOCS;
  if (hasContract()) {
    $("#ft-addr").textContent = shortAddr(addr);
    $("#ft-addr").title = addr;
    $("#ft-explorer").href = explorerAddress(addr);
    $("#ft-copy").addEventListener("click", () => copyText(addr, "Contract address copied"));
    reader()
      .total()
      .then((n) => ($("#ft-total").textContent = Number(n).toLocaleString()))
      .catch(() => ($("#ft-total").textContent = "—"));
  } else {
    $("#ft-copy").hidden = true;
    $("#ft-total").textContent = "0";
  }
  // Live chain status, like the reference's "All services are online".
  fetch(NET.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  })
    .then((r) => r.json())
    .then((j) => ($("#ft-status-text").textContent = `${NET.chainName} is live · block #${parseInt(j.result, 16).toLocaleString()}`))
    .catch(() => {
      $("#ft-status-text").textContent = `${NET.chainName} · status unavailable`;
      $("#ft-status .pulse").classList.remove("g");
    });
}

const PRIVACY = `<section class="page"><h1>Privacy</h1>
<p>ReadMeGen runs in your browser. Repo files are fetched from GitHub's public API straight into your browser.</p>
<p>To write the draft, the detected facts (not your whole repo) are sent to our Cloudflare Worker and an AI model. The Worker does not log repo content.</p>
<p>Your README history is saved only in this browser (localStorage). Stamps are public on BOT Chain and show the wallet address that stamped.</p></section>`;
const TERMS = `<section class="page"><h1>Terms</h1>
<p>ReadMeGen is provided as is, under the MIT license. Drafts are AI-assisted — always review them before publishing.</p>
<p>Stamping is an on-chain transaction you sign yourself. Anyone can stamp any public repo; the proof page shows who did.</p></section>`;

initWallet();
initFooter();
route();
