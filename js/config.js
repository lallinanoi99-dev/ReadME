// ReadMeGen — single place for addresses, endpoints and site content.

export const CONFIG = {
  // Mainnet contract — paste the address after deploying contracts/ReadMeGenStamps.sol with Remix.
  CONTRACT_ADDRESS: "0x5b6F5Eec95C4c9B2B6bB30Eb8ba4A52D2C4be6Af",

  // Shared Week 1 Cloudflare Worker (no trailing slash). Empty = template mode (no AI).
  WORKER_URL: "",

  // "mainnet" or "testnet" (use testnet while testing the contract).
  NETWORK: "mainnet",

  // Links
  BOTCHAIN_SITE: "https://botchain.ai",
  BOTCHAIN_DOCS: "https://botchain.ai",
};

export const NETWORKS = {
  mainnet: {
    chainId: 677,
    chainName: "BOT Chain",
    rpc: "https://rpc.botchain.ai",
    explorer: "https://scan.botchain.ai",
    // Check the native currency symbol in the BOT Chain docs before launch.
    currency: { name: "BOT", symbol: "BOT", decimals: 18 },
  },
  testnet: {
    chainId: 968,
    chainName: "BOT Chain Testnet",
    rpc: "https://rpc.bohr.life",
    explorer: "https://scan.bohr.life",
    currency: { name: "BOT", symbol: "BOT", decimals: 18 },
  },
};

export const NET = NETWORKS[CONFIG.NETWORK];

export const STYLES = [
  { id: "minimal", label: "Minimal", hint: "Short, clean" },
  { id: "detailed", label: "Detailed", hint: "Full docs" },
  { id: "hackathon", label: "Hackathon", hint: "BOT Chain checklist" },
];

// Section 7 — before/after slides. Replace with your own repos and the real numbers
// the app shows after you generate their READMEs.
export const BEFORE_AFTER = [
  {
    label: "Sample",
    repo: "your-name/hackathon-dapp",
    before: "# hackathon-dapp\n\nmy project for the hackathon",
    after:
      "# Hackathon dApp\n> Vote on proposals with one click on BOT Chain.\n\n![Live demo](…) ![BOT Chain mainnet](…)\n\n## What it does\n## How it works\n## Smart contract\n## Getting started\n```bash\nnpm install\nnpm run dev\n```",
    stats: { sectionsBefore: 1, sectionsAfter: 11, todos: 2, setupSteps: 3 },
  },
  {
    label: "Sample",
    repo: "your-name/token-tools",
    before: "# token-tools\n\nTODO",
    after:
      "# token-tools\n> Small helpers for ERC-20 balances and transfers.\n\n## Features\n## Tech stack\n## Project structure\n```\ncontracts/\nsrc/\n```\n## License\nMIT",
    stats: { sectionsBefore: 1, sectionsAfter: 8, todos: 3, setupSteps: 2 },
  },
  {
    label: "Sample",
    repo: "your-name/portfolio-site",
    before: "# portfolio-site\n\nCreated with create-vite",
    after:
      "# Portfolio\n> My work, on GitHub Pages.\n\n![Live demo](…)\n\n## Getting started\n```bash\nnpm run dev\nnpm run build\n```\n## Project structure",
    stats: { sectionsBefore: 1, sectionsAfter: 7, todos: 1, setupSteps: 2 },
  },
];

// Section 8 — example gallery. Real public repos: "Try it" opens the app on them.
export const EXAMPLES = [
  { cat: "Hackathon", repo: "scaffold-eth/scaffold-eth-2", blurb: "dApp starter kit used at many hackathons." },
  { cat: "Hackathon", repo: "ethereum/ethereum-org-website", blurb: "Big Next.js site with many contributors." },
  { cat: "Library", repo: "ethers-io/ethers.js", blurb: "JavaScript library for Ethereum." },
  { cat: "Library", repo: "markedjs/marked", blurb: "Markdown parser and compiler." },
  { cat: "Library", repo: "cure53/DOMPurify", blurb: "HTML sanitizer for the browser." },
  { cat: "App", repo: "excalidraw/excalidraw", blurb: "Whiteboard app in React." },
  { cat: "App", repo: "hoppscotch/hoppscotch", blurb: "Open source API client." },
  { cat: "Smart contract", repo: "OpenZeppelin/openzeppelin-contracts", blurb: "Solidity contract library." },
  { cat: "Smart contract", repo: "transmissions11/solmate", blurb: "Gas-optimized Solidity building blocks." },
  { cat: "Smart contract", repo: "Uniswap/v4-core", blurb: "Core contracts for Uniswap v4." },
];
