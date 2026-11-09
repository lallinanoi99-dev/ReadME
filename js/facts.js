// Facts extraction — plain code, no AI.

const DEP_STACK = [
  ["next", "Next.js"], ["react", "React"], ["vue", "Vue"], ["svelte", "Svelte"], ["@sveltejs/kit", "SvelteKit"],
  ["astro", "Astro"], ["vite", "Vite"], ["express", "Express"], ["hono", "Hono"], ["tailwindcss", "Tailwind CSS"],
  ["typescript", "TypeScript"], ["ethers", "ethers.js"], ["web3", "web3.js"], ["viem", "viem"], ["wagmi", "wagmi"],
  ["@rainbow-me/rainbowkit", "RainbowKit"], ["hardhat", "Hardhat"], ["@openzeppelin/contracts", "OpenZeppelin"],
  ["gsap", "GSAP"], ["three", "Three.js"], ["wrangler", "Cloudflare Workers"], ["@anthropic-ai/sdk", "Claude API"],
  ["openai", "OpenAI API"], ["jest", "Jest"], ["vitest", "Vitest"], ["mocha", "Mocha"],
];

export function extractFacts(data) {
  const { meta, tree, files, commit, truncated } = data;
  const paths = tree.map((n) => n.path);
  const has = (re) => paths.some((p) => re.test(p));
  const fileText = (re) => Object.entries(files).find(([p, t]) => re.test(p) && t)?.[1] || "";

  const stack = new Set();
  const tools = new Set();

  // package.json
  let pkg = null;
  try {
    pkg = JSON.parse(fileText(/(^|\/)package\.json$/));
  } catch {
    /* none or invalid */
  }
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  DEP_STACK.forEach(([d, label]) => d in deps && stack.add(label));
  const scripts = pkg?.scripts || {};
  const pm = has(/(^|\/)pnpm-lock\.yaml$/) ? "pnpm" : has(/(^|\/)yarn\.lock$/) ? "yarn" : has(/(^|\/)bun\.lockb?$/) ? "bun" : "npm";

  // files
  const htmlText = fileText(/(^|\/)index\.html?$/i);
  if (htmlText) {
    stack.add("HTML");
    if (/ethers(\.min)?\.js|ethers@|\/ethers\b/i.test(htmlText)) stack.add("ethers.js");
    if (/web3(\.min)?\.js/i.test(htmlText)) stack.add("web3.js");
    if (/gsap/i.test(htmlText)) stack.add("GSAP");
    if (/tailwind/i.test(htmlText)) stack.add("Tailwind CSS");
  }
  if (has(/\.css$/)) stack.add("CSS");
  if (has(/\.tsx?$/)) stack.add("TypeScript");
  if (has(/\.py$/)) stack.add("Python");
  if (has(/\.rs$/)) stack.add("Rust");
  if (has(/\.go$/)) stack.add("Go");
  const solFiles = Object.entries(files).filter(([p, t]) => /\.sol$/i.test(p) && t);
  if (has(/\.sol$/i)) stack.add("Solidity");
  if (has(/(^|\/)hardhat\.config\./)) tools.add("Hardhat");
  if (has(/(^|\/)foundry\.toml$/)) tools.add("Foundry");
  if (has(/\.sol$/i) && !tools.size) tools.add("Remix");

  // hosting
  let deploy = "";
  if (has(/(^|\/)CNAME$/) || meta.hasPages || has(/^\.github\/workflows\/.*pages/i)) deploy = "GitHub Pages";
  else if (has(/(^|\/)vercel\.json$/)) deploy = "Vercel";
  else if (has(/(^|\/)netlify\.toml$/)) deploy = "Netlify";
  else if (has(/(^|\/)wrangler\.(toml|jsonc?)$/)) deploy = "Cloudflare";
  if (deploy) tools.add(deploy);
  if (has(/(^|\/)wrangler\.(toml|jsonc?)$/)) stack.add("Cloudflare Workers");

  // contracts
  const contracts = solFiles.flatMap(([path, src]) => parseSolidity(path, src));

  // index.html meta
  const html = htmlText
    ? {
        title: (htmlText.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim(),
        description: (htmlText.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] || "").trim(),
      }
    : null;

  // .env.example — names only
  const envText = fileText(/(^|\/)\.env\.(example|sample|template)$/i);
  const envVars = envText ? [...envText.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]) : [];

  // existing README
  const readmeText = fileText(/(^|\/)readme(\.[a-z]+)?$/i);
  const existingReadme = readmeText
    ? {
        lines: readmeText.split("\n").length,
        headings: [...readmeText.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1].trim()).slice(0, 30),
        excerpt: readmeText.slice(0, 1500),
      }
    : null;

  const addresses = [...new Set([...(readmeText + "\n" + htmlText).matchAll(/0x[a-fA-F0-9]{40}\b/g)].map((m) => m[0]))].slice(0, 3);
  const links = {
    video: (readmeText.match(/https?:\/\/(www\.)?(youtube\.com|youtu\.be|loom\.com|vimeo\.com)\/[^\s)"'>]+/i) || [""])[0],
    x: (readmeText.match(/https?:\/\/(www\.)?(x|twitter)\.com\/[A-Za-z0-9_]+[^\s)"'>]*/i) || [""])[0],
  };

  const license = meta.license || (has(/^LICENSE(\.md|\.txt)?$/i) ? "See LICENSE" : "");

  return {
    name: pkg?.name && !/^(my-app|app|project|vite-project)$/.test(pkg.name) ? pkg.name : meta.repo,
    full: meta.full,
    owner: meta.owner,
    repo: meta.repo,
    branch: meta.branch,
    commit,
    description: meta.description || pkg?.description || html?.description || "",
    homepage: meta.homepage || "",
    language: meta.language,
    license,
    topics: meta.topics,
    stack: [...stack],
    tools: [...tools],
    packageManager: pm,
    scripts,
    contracts,
    structure: structure(tree),
    envVars,
    html,
    existingReadme,
    addresses,
    links,
    hasScreenshotsDir: has(/(^|\/)(screenshots?|docs\/images?|assets\/screenshots?)\//i),
    truncated,
  };
}

function parseSolidity(path, src) {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const out = [];
  const re = /\b(abstract\s+contract|contract|library|interface)\s+([A-Za-z_]\w*)[^{]*\{/g;
  let m;
  const starts = [];
  while ((m = re.exec(clean))) starts.push({ kind: m[1].replace(/\s+/g, " "), name: m[2], at: m.index });
  starts.forEach((s, i) => {
    const body = clean.slice(s.at, starts[i + 1]?.at ?? clean.length);
    const fns = [...body.matchAll(/function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)([^{;]*)/g)]
      .filter((f) => /\b(public|external)\b/.test(f[3]) || s.kind === "interface")
      .map((f) => {
        const params = f[2].split(",").map((p) => p.trim().replace(/\s+(memory|calldata|storage)\b/g, "")).filter(Boolean).join(", ");
        const view = /\b(view|pure)\b/.test(f[3]) ? " view" : /\bpayable\b/.test(f[3]) ? " payable" : "";
        return `${f[1]}(${params})${view}`;
      });
    const events = [...body.matchAll(/event\s+([A-Za-z_]\w*)\s*\(/g)].map((e) => e[1]);
    if (s.kind !== "interface" || fns.length) out.push({ kind: s.kind, name: s.name, file: path, functions: fns.slice(0, 20), events: events.slice(0, 10) });
  });
  return out.filter((c) => c.kind !== "interface");
}

// Top 2 levels as a text tree.
function structure(tree) {
  const skip = /^(node_modules|\.git|dist|build|out|\.next|coverage|cache|artifacts|typechain-types)$/;
  const top = new Map();
  for (const n of tree) {
    const parts = n.path.split("/");
    if (skip.test(parts[0]) || (parts[0].startsWith(".") && parts[0] !== ".github")) continue;
    if (!top.has(parts[0])) top.set(parts[0], { dir: parts.length > 1 || n.type === "tree", kids: new Set() });
    if (parts.length >= 2) top.get(parts[0]).kids.add(parts[1] + (parts.length > 2 || n.type === "tree" ? "/" : ""));
  }
  const entries = [...top.entries()].sort((a, b) => b[1].dir - a[1].dir || a[0].localeCompare(b[0])).slice(0, 25);
  const lines = [];
  entries.forEach(([name, info], i) => {
    const last = i === entries.length - 1;
    lines.push(`${last ? "└──" : "├──"} ${name}${info.dir ? "/" : ""}`);
    const kids = [...info.kids].sort((a, b) => b.endsWith("/") - a.endsWith("/") || a.localeCompare(b));
    kids.slice(0, 8).forEach((k, j) => {
      lines.push(`${last ? "    " : "│   "}${j === Math.min(kids.length, 8) - 1 && kids.length <= 8 ? "└──" : "├──"} ${k}`);
    });
    if (kids.length > 8) lines.push(`${last ? "    " : "│   "}└── … ${kids.length - 8} more`);
  });
  return lines.join("\n");
}

export function stackLine(f) {
  return [...f.stack, ...f.tools.filter((t) => !f.stack.includes(t))].join(" · ") || "No stack detected";
}
