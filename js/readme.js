// README model: template writer (AI fallback), sections, badges, score.
import { NETWORKS } from "./config.js";
import { stackLine } from "./facts.js";

export const STYLE_INDEX = { minimal: 0, detailed: 1, hackathon: 2 };

const ORDER = {
  minimal: ["intro", "what", "features", "start", "license"],
  detailed: ["intro", "demo", "what", "features", "how", "stack", "contract", "start", "structure", "roadmap", "license", "credits"],
  hackathon: ["intro", "demo", "what", "how", "contract", "stack", "start", "structure", "submission", "license"],
};

const TITLES = {
  demo: "Demo",
  what: "What it does",
  features: "Features",
  how: "How it works",
  stack: "Tech stack",
  contract: "Smart contract",
  start: "Getting started",
  structure: "Project structure",
  roadmap: "Roadmap",
  license: "License",
  credits: "Credits",
  submission: "Submission links",
};

export const explorerFor = (network) => (String(network) === "968" ? NETWORKS.testnet.explorer : NETWORKS.mainnet.explorer);
const netName = (n) => (String(n) === "968" ? "BOT Chain testnet (chain ID 968)" : "BOT Chain mainnet (chain ID 677)");

// ---------- badges ----------
export const BADGES = [
  { id: "license", label: "License" },
  { id: "language", label: "Top language" },
  { id: "demo", label: "Live demo" },
  { id: "botchain", label: "BOT Chain mainnet" },
  { id: "ethers", label: "Built with ethers.js" },
  { id: "documented", label: "Documented on BOT Chain" },
];

export function defaultBadges(f, uf) {
  const ids = f.license && f.license !== "See LICENSE" ? ["license", "language"] : ["language"];
  if (uf.liveUrl) ids.push("demo");
  if (uf.contracts?.some((c) => c.address)) ids.push("botchain");
  if (f.stack.includes("ethers.js")) ids.push("ethers");
  return ids;
}

export function badgesMarkdown(ids, f, uf, workerUrl, proofUrl) {
  const o = encodeURIComponent(f.owner);
  const r = encodeURIComponent(f.repo);
  const firstAddr = uf.contracts?.find((c) => c.address);
  const map = {
    license: `[![License](https://img.shields.io/github/license/${o}/${r})](LICENSE)`,
    language: `![Top language](https://img.shields.io/github/languages/top/${o}/${r})`,
    demo: uf.liveUrl ? `[![Live demo](https://img.shields.io/badge/demo-live-3FB950)](${uf.liveUrl})` : "",
    botchain: `[![BOT Chain mainnet](https://img.shields.io/badge/BOT%20Chain-mainnet%20677-111315)](${firstAddr ? `${explorerFor(firstAddr.network)}/address/${firstAddr.address}` : "https://botchain.ai"})`,
    ethers: `![Built with ethers.js](https://img.shields.io/badge/built%20with-ethers.js-2535A0)`,
    documented: workerUrl && proofUrl ? `[![Documented on BOT Chain](${workerUrl}/badge.svg?repo=${encodeURIComponent(f.full.toLowerCase())})](${proofUrl})` : "",
  };
  return ids.map((id) => map[id]).filter(Boolean).join(" ");
}

// Replace (or insert) the badge line inside the intro block.
export function applyBadges(md, badgeLine) {
  const block = `<!-- badges -->\n${badgeLine}\n<!-- /badges -->`;
  if (/<!-- badges -->[\s\S]*?<!-- \/badges -->/.test(md)) {
    return md.replace(/<!-- badges -->[\s\S]*?<!-- \/badges -->/, badgeLine ? block : "").replace(/\n{3,}/g, "\n\n");
  }
  if (!badgeLine) return md;
  const lines = md.split("\n");
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  lines.splice(h1 >= 0 ? h1 + 1 : 0, 0, "", block);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

// ---------- template writer ----------
export function templateReadme(f, uf, style, badgeLine) {
  return ORDER[style]
    .map((k) => templateSection(k, f, uf, style, badgeLine))
    .filter(Boolean)
    .join("\n\n")
    .trim() + "\n";
}

export function templateSection(key, f, uf, style, badgeLine = "") {
  const name = uf.name || f.name;
  const tagline = uf.tagline || f.description;
  const run = (s) => (f.packageManager === "npm" ? (s === "start" || s === "test" ? `npm ${s}` : `npm run ${s}`) : `${f.packageManager} ${s}`);
  const contracts = (uf.contracts || []).filter((c) => c.address);
  const T = (k) => `## ${TITLES[k]}`;

  switch (key) {
    case "intro":
      return [
        `# ${name}`,
        badgeLine ? `\n<!-- badges -->\n${badgeLine}\n<!-- /badges -->` : "",
        "",
        tagline ? `> ${tagline}` : "> TODO: one-line tagline",
      ].join("\n");

    case "demo": {
      const out = [T("demo"), ""];
      out.push(uf.liveUrl ? `**Live:** ${uf.liveUrl}` : "TODO: add the live URL");
      if (uf.videoUrl) out.push(`\n**Video:** ${uf.videoUrl}`);
      if (uf.screenshots?.length) out.push("", ...uf.screenshots.map((u, i) => `![Screenshot ${i + 1}](${u})`));
      else out.push("", "TODO: add a screenshot or GIF");
      return out.join("\n");
    }

    case "what":
      return [
        T("what"),
        "",
        tagline || "TODO: explain in two sentences what the project does and who it is for.",
        f.existingReadme ? "" : "",
      ].join("\n").trim();

    case "features": {
      const items = [];
      f.contracts.slice(0, 3).forEach((c) => items.push(`- \`${c.name}\` smart contract with ${c.functions.length} public function${c.functions.length === 1 ? "" : "s"}`));
      if (f.stack.includes("ethers.js") || f.stack.includes("viem") || f.stack.includes("wagmi")) items.push("- Wallet connection in the browser");
      if (f.homepage || uf.liveUrl) items.push(`- Live on the web${f.tools.includes("GitHub Pages") ? " (GitHub Pages)" : ""}`);
      items.push("- TODO: list the 3–5 main things a user can do");
      return [T("features"), "", ...items].join("\n");
    }

    case "how": {
      const lines = [T("how"), ""];
      if (f.contracts.length && (f.html || f.stack.some((s) => ["React", "Next.js", "Vue", "Svelte", "SvelteKit", "Astro"].includes(s)))) lines.push(`1. The web app talks to the \`${f.contracts[0].name}\` contract${contracts.length ? ` on ${netName(contracts[0].network)}` : ""}.`);
      lines.push("TODO: describe the main flow in 3 steps (what the user does → what happens → what they get).");
      return lines.join("\n");
    }

    case "stack":
      return [T("stack"), "", ...stackLine(f).split(" · ").map((s) => `- ${s}`)].join("\n");

    case "contract": {
      if (!f.contracts.length && !contracts.length) return style === "hackathon" ? `${T("contract")}\n\nTODO: add the contract address and network` : "";
      const out = [T("contract"), ""];
      if (contracts.length) {
        out.push("| Network | Address |", "| --- | --- |");
        contracts.forEach((c) => out.push(`| ${netName(c.network)} | [\`${c.address}\`](${explorerFor(c.network)}/address/${c.address}) |`));
        out.push("");
      } else out.push("TODO: add the deployed contract address and network", "");
      f.contracts.forEach((c) => {
        out.push(`**${c.name}** — \`${c.file}\``, "");
        if (c.functions.length) out.push("| Function |", "| --- |", ...c.functions.map((fn) => `| \`${fn}\` |`), "");
        if (c.events.length) out.push(`Events: ${c.events.map((e) => `\`${e}\``).join(", ")}`, "");
      });
      return out.join("\n").trim();
    }

    case "start": {
      const s = f.scripts || {};
      const cmds = [`git clone https://github.com/${f.full}.git`, `cd ${f.repo}`];
      if (Object.keys(s).length) {
        cmds.push(`${f.packageManager} install`);
        ["dev", "start", "build", "test"].forEach((k) => s[k] && cmds.push(run(k)));
      }
      if (f.tools.includes("Hardhat")) cmds.push("npx hardhat compile");
      if (f.tools.includes("Foundry")) cmds.push("forge build");
      const out = [T("start"), "", "```bash", ...cmds, "```"];
      if (!Object.keys(s).length && f.html) out.push("", "Open `index.html` in a browser, or serve the folder with any static server.");
      if (f.envVars.length) out.push("", "Copy `.env.example` to `.env` and set:", "", ...f.envVars.map((v) => `- \`${v}\``));
      const other = Object.keys(s).filter((k) => !["dev", "start", "build", "test"].includes(k));
      if (other.length) out.push("", "Other scripts: " + other.slice(0, 8).map((k) => `\`${run(k)}\``).join(", "));
      return out.join("\n");
    }

    case "structure":
      return f.structure ? [T("structure"), "", "```", f.structure, "```"].join("\n") : "";

    case "roadmap":
      return uf.roadmap ? [T("roadmap"), "", ...uf.roadmap.split("\n").filter(Boolean).map((l) => (l.startsWith("-") ? l : `- [ ] ${l}`))].join("\n") : "";

    case "submission": {
      const out = [T("submission"), ""];
      out.push(`- Live demo: ${uf.liveUrl || "TODO"}`);
      out.push(`- Demo video: ${uf.videoUrl || "TODO"}`);
      out.push(`- Repo: https://github.com/${f.full}`);
      if (contracts.length) out.push(`- Contract: ${explorerFor(contracts[0].network)}/address/${contracts[0].address}`);
      else out.push("- Contract: TODO");
      if (uf.xUrl) out.push(`- X: ${uf.xUrl}`);
      return out.join("\n");
    }

    case "license": {
      const lic = uf.license || f.license;
      return [T("license"), "", lic ? (lic === "See LICENSE" ? "See [LICENSE](LICENSE)." : `${lic} — see [LICENSE](LICENSE).`) : "TODO: pick a license"].join("\n");
    }

    case "credits":
      return [T("credits"), "", `Built by [@${f.owner}](https://github.com/${f.owner}).`, uf.xUrl ? `Follow: ${uf.xUrl}` : ""].join("\n").trim();
  }
  return "";
}

// Find which template key a heading belongs to (for section regenerate fallback).
export function keyForHeading(heading) {
  if (!heading) return "intro";
  const h = heading.toLowerCase();
  const found = Object.entries(TITLES).find(([, t]) => h.includes(t.toLowerCase()));
  if (found) return found[0];
  if (/install|setup|run|usage|start/.test(h)) return "start";
  if (/stack|built with|tech/.test(h)) return "stack";
  if (/contract|chain/.test(h)) return "contract";
  if (/structure|layout|files/.test(h)) return "structure";
  if (/about|overview|what/.test(h)) return "what";
  return null;
}

// ---------- sections ----------
let uid = 0;
export function splitSections(md) {
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let cur = { id: `s${uid++}`, heading: null, lines: [] };
  let fence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence && /^##\s+/.test(line)) {
      out.push(cur);
      cur = { id: `s${uid++}`, heading: line.replace(/^##\s+/, "").trim(), lines: [] };
    }
    cur.lines.push(line);
  }
  out.push(cur);
  return out
    .map((s) => ({ id: s.id, heading: s.heading, text: s.lines.join("\n").trim() }))
    .filter((s, i) => i > 0 || s.text);
}

export const joinSections = (secs) => secs.map((s) => s.text.trim()).filter(Boolean).join("\n\n") + "\n";

// ---------- score ----------
export function scoreReadme(md, f) {
  const has = (re) => re.test(md);
  const checks = [
    ["Title and tagline", has(/^#\s+\S/m) && has(/^>\s+(?!TODO)\S/m)],
    ["Demo link", has(/\]\(https?:\/\/[^)]+\)|https?:\/\/\S+/) && has(/demo|live/i)],
    ["Screenshots", has(/!\[[^\]]*\]\((?!https:\/\/img\.shields\.io)[^)]+\)/)],
    ["Setup steps", has(/```(bash|sh|shell)?\n[\s\S]*?(install|npm|yarn|pnpm|forge|npx|git clone)/)],
    ["Contract link", !f?.contracts?.length || has(/scan\.(botchain\.ai|bohr\.life)\/address\/0x[a-fA-F0-9]{40}/)],
    ["Project structure", has(/[├└]──/)],
    ["License", has(/^##\s+License/im)],
    ["Badges", has(/img\.shields\.io|badge\.svg/)],
    ["No TODOs left", !has(/TODO/)],
  ];
  const todos = (md.match(/TODO/g) || []).length;
  return { checks, passed: checks.filter((c) => c[1]).length, total: checks.length, todos };
}
