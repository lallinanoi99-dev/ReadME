# ReadMeGen

> Paste a repo, get a great README. ReadMeGen reads your project, writes a clean, accurate README from real repo facts — then stamps the version on BOT Chain.

![BOT Chain mainnet](https://img.shields.io/badge/BOT%20Chain-mainnet%20677-111315) ![License](https://img.shields.io/badge/license-MIT-3FB950)

**Live:** TODO: add the GitHub Pages URL
**Contract (BOT Chain mainnet, chain ID 677):** [`0x5b6F5Eec95C4c9B2B6bB30Eb8ba4A52D2C4be6Af`](https://scan.botchain.ai/address/0x5b6F5Eec95C4c9B2B6bB30Eb8ba4A52D2C4be6Af)

## What it does

1. **Read** — paste `github.com/owner/repo`. The browser reads the file tree, `package.json`, up to 3 Solidity files, `index.html`, config files and the existing README through GitHub's public API.
2. **Facts** — plain code (no AI) detects the stack, npm scripts, contract names and public functions, and the folder structure. You add what code can't see: tagline, live URL, contract address, video, license, screenshots.
3. **Draft** — the Worker asks Claude to turn the facts into Markdown in one of three styles (Minimal, Detailed, Hackathon). It must never invent features or commands; missing info becomes `TODO:`. If the AI is down, a template filled with the detected facts is used instead.
4. **Edit** — split view: Markdown editor (CodeMirror) + GitHub-style preview. Regenerate, shorten, delete or drag any section. Badge picker and a README score checklist.
5. **Export** — copy, download `README.md`, or open the GitHub editor.
6. **Stamp** — one transaction saves the repo, latest commit SHA and the SHA-256 fingerprint of the README on BOT Chain. The proof page `/r/owner/repo` shows who stamped it and whether today's README still matches.

## Project structure

```
├── index.html            website (/) + app (/app) + proof page (/r/owner/repo)
├── 404.html              GitHub Pages SPA fallback
├── css/                  site.css (website + footer), app.css (app + proof)
├── js/
│   ├── config.js         contract address, Worker URL, networks, homepage content
│   ├── main.js           router, nav, footer
│   ├── home.js           homepage sections + GSAP animations
│   ├── app.js            read → facts → draft → edit → export → stamp
│   ├── github.js         GitHub API reads, rate limit, cache
│   ├── facts.js          stack / scripts / Solidity / structure detection
│   ├── readme.js         template writer, sections, badges, score
│   ├── chain.js          MetaMask, BOT Chain switching, contract calls
│   └── proof.js          proof page
├── contracts/            ReadMeGenStamps.sol + ABI
├── worker/               Cloudflare Worker (/readme/draft, /readme/section, /badge.svg)
└── serve.mjs             local dev server
```

## Run locally

```bash
node serve.mjs
```

Open http://localhost:5173. Without a Worker URL the app runs in template mode; without a contract address everything works except stamping.

## Deploy

### 1. Contract (Remix)

1. Open `contracts/ReadMeGenStamps.sol` in [Remix](https://remix.ethereum.org). Compiler `0.8.24`, EVM version **paris**, optimizer on.
2. Test first on BOT Chain testnet — chain ID `968`, RPC `https://rpc.bohr.life`, explorer `https://scan.bohr.life`.
3. Deploy to mainnet — chain ID `677`, RPC `https://rpc.botchain.ai`, explorer `https://scan.botchain.ai`.
4. Paste the address into `CONTRACT_ADDRESS` in `js/config.js`, `worker/wrangler.toml`, and the top of this README.

### 2. Worker (Cloudflare)

```bash
cd worker
npm install
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

Set `ALLOWED_ORIGINS` in `wrangler.toml` to your site's domain (CORS is locked to it). Then put the Worker URL in `WORKER_URL` in `js/config.js`. The Worker uses Claude Opus 5.5 with server-side refusal fallback enabled, rate-limits 20 AI calls per IP per 10 minutes (bind `RATE_KV` for a shared limit), and never logs repo content.

### 3. Website (GitHub Pages)

Push the repo, enable Pages from the root of the default branch, and rename `CNAME.example` to `CNAME` with your domain.

## Smart contract

`ReadMeGenStamps` — no tokens, no payments.

| Function | |
| --- | --- |
| `stamp(string repo, bytes20 commit, bytes32 readmeHash, uint8 style)` | Save a stamp, returns its id |
| `getStamp(uint256 id) view` | One stamp |
| `latestForRepo(string repo) view` | Newest stamp for `owner/repo` |
| `historyForRepo(string repo) view` | All stamp ids for a repo |
| `stampsOf(address who) view` | Stamp ids by an address |
| `total() view` | Number of stamps |

Event: `Stamped(uint256 indexed id, string repo, address indexed by, bytes32 readmeHash)`

## Tech stack

HTML · CSS · JavaScript modules · ethers.js v6 · marked + DOMPurify · github-markdown-css · CodeMirror 6 · SortableJS · GSAP 3.13 (ScrollTrigger, SplitText, TextPlugin, Flip) · Cloudflare Workers · Claude API · Solidity 0.8.24

## License

MIT · drafts are AI-assisted — always review.
