// BOT Chain: wallet connection, network switching and contract access.
import { BrowserProvider, Contract, JsonRpcProvider } from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm";
import { CONFIG, NET } from "./config.js";
import { $$, shortAddr, toast } from "./util.js";

export const STAMP_ABI = [
  "function stamp(string repo, bytes20 commit, bytes32 readmeHash, uint8 style) returns (uint256 id)",
  "function getStamp(uint256 id) view returns (tuple(address by, string repo, bytes20 commit, bytes32 readmeHash, uint8 style, uint64 at))",
  "function latestForRepo(string repo) view returns (uint256 id, tuple(address by, string repo, bytes20 commit, bytes32 readmeHash, uint8 style, uint64 at) s)",
  "function historyForRepo(string repo) view returns (uint256[])",
  "function stampsOf(address who) view returns (uint256[])",
  "function total() view returns (uint256)",
  "event Stamped(uint256 indexed id, string repo, address indexed by, bytes32 readmeHash)",
];

export const hasContract = () => /^0x[0-9a-fA-F]{40}$/.test(CONFIG.CONTRACT_ADDRESS);
export const explorerAddress = (a) => `${NET.explorer}/address/${a}`;
export const explorerTx = (h) => `${NET.explorer}/tx/${h}`;
const HEX_CHAIN = "0x" + NET.chainId.toString(16);

let readProvider;
export function reader() {
  if (!hasContract()) return null;
  readProvider ??= new JsonRpcProvider(NET.rpc, NET.chainId, { staticNetwork: true });
  return new Contract(CONFIG.CONTRACT_ADDRESS, STAMP_ABI, readProvider);
}

// ---------- wallet state ----------
export const wallet = { address: null, chainId: null };
const listeners = new Set();
export const onWallet = (fn) => (listeners.add(fn), fn(wallet));
const emit = () => {
  listeners.forEach((fn) => fn(wallet));
  renderWalletButtons();
};
export const onRightChain = () => wallet.chainId === NET.chainId;

function renderWalletButtons() {
  $$("[data-wallet]").forEach((b) => {
    b.classList.toggle("connected", !!wallet.address && onRightChain());
    b.classList.toggle("wrong", !!wallet.address && !onRightChain());
    b.textContent = !wallet.address
      ? "Connect wallet"
      : onRightChain()
        ? shortAddr(wallet.address)
        : "Switch to BOT Chain";
  });
}

export async function connect() {
  const eth = window.ethereum;
  if (!eth) {
    toast("MetaMask not found — everything works except stamping.", true);
    return null;
  }
  try {
    const [addr] = await eth.request({ method: "eth_requestAccounts" });
    wallet.address = addr;
    wallet.chainId = parseInt(await eth.request({ method: "eth_chainId" }), 16);
    if (!onRightChain()) await switchChain();
    emit();
    return wallet.address;
  } catch (e) {
    if (e?.code === 4001) toast("Connection request was rejected.", true);
    else toast("Could not connect wallet.", true);
    return null;
  }
}

export async function switchChain() {
  const eth = window.ethereum;
  if (!eth) return false;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: HEX_CHAIN }] });
  } catch (e) {
    if (e?.code === 4902 || e?.data?.originalError?.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: HEX_CHAIN,
            chainName: NET.chainName,
            nativeCurrency: NET.currency,
            rpcUrls: [NET.rpc],
            blockExplorerUrls: [NET.explorer],
          },
        ],
      });
    } else {
      toast("Please switch to BOT Chain in MetaMask.", true);
      return false;
    }
  }
  wallet.chainId = parseInt(await eth.request({ method: "eth_chainId" }), 16);
  emit();
  return onRightChain();
}

export function initWallet() {
  const eth = window.ethereum;
  $$("[data-wallet]").forEach((b) =>
    b.addEventListener("click", () => (wallet.address && !onRightChain() ? switchChain() : !wallet.address && connect())),
  );
  renderWalletButtons();
  if (!eth) return;
  eth.request({ method: "eth_accounts" }).then(async (accs) => {
    if (accs?.[0]) {
      wallet.address = accs[0];
      wallet.chainId = parseInt(await eth.request({ method: "eth_chainId" }), 16);
      emit();
    }
  });
  eth.on?.("accountsChanged", (accs) => {
    wallet.address = accs?.[0] || null;
    emit();
  });
  eth.on?.("chainChanged", (id) => {
    wallet.chainId = parseInt(id, 16);
    emit();
  });
}

export async function writer() {
  if (!wallet.address) await connect();
  if (!wallet.address) return null;
  if (!onRightChain() && !(await switchChain())) return null;
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new Contract(CONFIG.CONTRACT_ADDRESS, STAMP_ABI, signer);
}

// Recent stamps for the homepage strip (newest first).
export async function recentStamps(n = 16) {
  const c = reader();
  if (!c) return [];
  const total = Number(await c.total());
  const ids = [];
  for (let i = total - 1; i >= 0 && ids.length < n; i--) ids.push(i);
  const list = await Promise.all(ids.map((i) => c.getStamp(i).catch(() => null)));
  return list.filter(Boolean);
}
