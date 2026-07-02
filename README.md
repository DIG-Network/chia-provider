# @dignetwork/chia-provider

The canonical DIG **`window.chia`** wallet provider — a Goby / CHIP-0002 / Sage-WalletConnect2
compatible injected provider surface, **shared by the DIG Browser and the dig-chrome-extension**
so a dApp sees the *same* `window.chia` on either. One contract, two consumers, no drift.

The provider is **transport-agnostic**: you inject a `bridgeCall(method, params) → {status, body}`
and get back the provider object. Each consumer supplies its own transport:

- **DIG Browser** — an in-process native bridge (`window.__digWalletRpc`, a Mojo pipe).
- **dig-chrome-extension** — `window.postMessage` → content script → background SW → WalletConnect → Sage.

## Why it exists

A dApp built for **Goby** (dexie.space, tibetswap, …) or **Sage's WC2 API** expects a specific
`window.chia` shape: identity flags (`isGoby`), Goby-legacy **direct methods** on the object
(`provider.getPublicKeys()`, `.transfer()`, …), `requestAccounts()`/`accounts()`, and bare method
names that don't map 1:1 to `chip0002_*` (Goby's `transfer` is Sage's `chia_send`). This package
implements that superset once, so both DIG surfaces are interoperable with the existing Chia dApp
ecosystem. See `SPEC.md` for the normative contract.

## Usage

```js
import { buildProvider } from '@dignetwork/chia-provider';

const provider = buildProvider({
  version: '1.2.3',
  // Return the wallet's { status, body:{ data } } envelope (200 ok, 202 pending, 4xx/5xx error).
  bridgeCall: async (method, params) => myTransport(method, params),
});

globalThis.chia = provider; // inject into the page's MAIN world
```

CHIP-0002, Goby-legacy, and Sage-WC2 dApps then all work:

```js
await window.chia.request({ method: 'connect' });        // CHIP-0002
const keys = await window.chia.getPublicKeys();          // Goby-legacy direct method
const [addr] = await window.chia.requestAccounts();      // Goby account helper
await window.chia.transfer({ to: addr, amount: 1000 });  // → routed to chia_send{address}
window.chia.isGoby;        // true (Goby feature-detection)
window.chia.isConnected(); // boolean (Goby convention: a callable)
```

## Surface

- **Identity:** `isDIG`, `isGoby`, `name`, `version`, `apiVersion`, `info`, `methods`, `errorCodes`.
- **CHIP-0002:** `request({ method, params })` — accepts bare, `chip0002_*`, and `chia_*` names.
- **Goby-legacy direct methods:** `connect`, `getPublicKeys`, `filterUnlockedCoins`, `getAssetCoins`,
  `getAssetBalance`, `signCoinSpends`, `signMessage`, `signMessageByAddress`, `transfer`,
  `sendTransaction`, `createOffer`, `takeOffer`, `cancelOffer`, `getNFTs`, `getNFTInfo`,
  `walletSwitchChain`, `walletWatchAsset`, `requestAccounts`, `accounts`.
- **Accessors:** `chainId`, `selectedAddress`, `isConnected()`.
- **Events:** `on` / `off` / `removeListener` — `connect`, `chainChanged`, `accountChanged`.

## Method-name routing

`normalizeMethod` + `GOBY_ALIASES` route a dApp-facing name to the broker method; `remapGobyParams`
adapts params (Goby `transfer{to}` → Sage `chia_send{address}`). Already-namespaced `chip0002_*` /
`chia_*` pass through unchanged.

## Testing

```
npm test            # node --test
npm run coverage    # c8, gated ≥80% lines/functions
```

MIT.
