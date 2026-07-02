# SPEC — `@dignetwork/chia-provider` (the DIG `window.chia` contract)

Normative. This is the authoritative contract for the injected `window.chia` provider an independent
reimplementation can be built against. It layers on CHIP-0002 (the Chia wallet standard), the Goby
provider conventions, and Sage's WalletConnect2 method names. Both DIG consumers (the DIG Browser
in-process provider and the dig-chrome-extension IIFE) MUST expose this exact surface.

## 1. Object identity

`window.chia` MUST expose, as own enumerable properties:

| Property | Type | Value / semantics |
|---|---|---|
| `isDIG` | `true` | Marks a DIG provider. |
| `isGoby` | `true` | Goby feature-detection flag. dApps that gate on `window.chia.isGoby` MUST treat this provider as Goby-compatible. |
| `name` | `string` | The wallet display name (`"DIG"`). |
| `version` | `string` | The consumer build version (extension manifest / browser build). `"unknown"` if unavailable. |
| `apiVersion` | `string` | The provider-contract API version (`"1.0.0"` for this surface). |
| `info` | object | `{ isDIG:true, transport, edition, providerVersion, scheme?, version? }` — self-describing capability object. `transport` ∈ {`walletconnect`, `native`}; `edition` ∈ {`extension`, `browser`}. |
| `methods` | `string[]` | The broker method catalogue (fully-namespaced `chip0002_*`/`chia_*`). |
| `errorCodes` | object | The thrown-error code enum (§4). |

## 2. Transport contract (`bridgeCall`)

The provider is transport-injected. `buildProvider({ bridgeCall, version, emit? })` returns the
object. `bridgeCall(method, params, timeoutMs?)` MUST resolve to an envelope
`{ status:number, body?:{ data?, error? }, error? }` (or a nullish value meaning "unreachable").

`rpc(method, params)` semantics over the envelope:
- **`status === 200`** → resolve `body.data`.
- **`status === 202`** → THROW a pending error (`code = 4001`, `pending = true`). This is the
  approval-pending signal `connect()` polls on. A 202 MUST NOT resolve as success.
- **any other status, or a nullish envelope** → THROW per §4 mapping.

## 3. Methods

### 3.1 `request({ method, params })`
Accepts three name forms and routes them to the broker:
1. already-namespaced (`chip0002_*` / `chia_*`) → passed through unchanged;
2. a Goby/Sage alias (`transfer`, `createOffer`, `getNFTs`, …) → mapped via `GOBY_ALIASES`
   (`chia_send`, `chia_createOffer`, `chia_getNfts`, …);
3. any other bare name → `chip0002_<name>`.

`params` are adapted by `remapGobyParams` before dispatch: for `transfer`/`send`, `{ to }` is
rewritten to `{ address }` (Sage `chia_send` naming) unless an explicit `address` is present.

Locally-answered (no round-trip): `chip0002_getMethods` / `chia_getMethods` / `getMethods` return
`methods`. `connect`/`chip0002_connect` dispatch into `connect()`. `requestAccounts`, `accounts`,
`walletSwitchChain` dispatch into their handlers (§3.3).

### 3.2 Goby-legacy direct methods
Each of the following MUST exist as an own method that behaves identically to `request({method, params})`
for the same name (dApps built against Goby call these on the object directly):
`connect`, `walletSwitchChain`, `walletWatchAsset`, `getPublicKeys`, `filterUnlockedCoins`,
`getAssetCoins`, `getAssetBalance`, `signCoinSpends`, `signMessage`, `signMessageByAddress`,
`transfer`, `sendTransaction`, `createOffer`, `takeOffer`, `cancelOffer`, `getNFTs`, `getNFTInfo`,
`requestAccounts`, `accounts`.

### 3.3 Special handlers
- **`connect(eager?)`** — dispatches `chip0002_connect{ eager }`; on a 202 pending it polls
  (≤120 s deadline, ~1.2 s backoff) until approval/rejection/timeout; on success sets the
  connected state, sets `chainId = "mainnet"`, and fires the `connect` event.
- **`requestAccounts()`** — `connect()` (prompts if not connected), then resolves to the address
  list (`[selectedAddress]`), caching `selectedAddress`.
- **`accounts()`** — if not connected, rejects with `4900`; otherwise resolves the address list
  without prompting.
- **`walletSwitchChain({ chainId })`** — answered locally: `"mainnet"` (or absent) resolves `null`;
  any other chain rejects with `4200` (DIG is Chia mainnet only). MUST NOT hit the broker.

### 3.4 Accessors & connection state
- `isConnected()` is a **callable** returning a boolean (Goby convention), NOT a boolean property.
- `chainId` (getter) is `undefined` until connected, then `"mainnet"`.
- `selectedAddress` (getter) is the cached primary receive address (set by
  `requestAccounts`/`accounts`), else `undefined`.

### 3.5 Events
`on(event, fn)`, `off(event, fn)`, `removeListener(event, fn)`. Recognised events: `connect`,
`chainChanged`, `accountChanged`. Registering any event MUST NOT throw. A throwing listener MUST be
isolated (MUST NOT break dispatch or reject the triggering call).

## 4. Error codes (thrown `Error.code`)

EIP-1193 / CHIP-0002 aligned. The `mapEnvelopeToError(env)` mapping is normative:

| Condition | `code` | Name |
|---|---|---|
| nullish envelope / `status ≥ 500` / `status === 0` | `4900` | `DISCONNECTED` |
| `status === 202` | `4001` (`pending=true`) | `USER_REJECTED` (pending) |
| `status === 401` / `403` | `4100` | `UNAUTHORIZED` |
| `status === 404` | `4200` | `UNSUPPORTED_METHOD` |
| any other non-2xx | `4001` | `USER_REJECTED` |

Thrown errors carry `code`, `message`, and (when derived from a transport status) `status`.

## 5. State-changing methods

`STATE_CHANGING_METHODS` (normalised names) require an explicit per-call wallet approval in addition
to the per-origin connect consent: `chip0002_signMessage`, `chip0002_signCoinSpends`,
`chia_signMessageByAddress`, `chia_send`, `chia_transferNft`, `chia_mintNft`, `chia_bulkMintNfts`,
`chia_createDidWallet`, `chia_transferDid`, `chia_createOffer`, `chia_takeOffer`, `chia_cancelOffer`.
Read methods (chainId, getPublicKeys, getAddress, balances, summaries) do not.

## 6. Conformance

- Both consumers MUST derive their `window.chia` from `buildProvider` (or a build-bundled copy of
  it) — they MUST NOT hand-roll a divergent surface. The method catalogue, alias table, param
  remap, error codes, and 202-pending handling MUST be byte-identical across consumers (this package
  is the single source of truth; the previous per-consumer duplication caused drift, e.g. one
  consumer mishandling 202).
- `never clobber`: injection MUST NOT overwrite an already-present `window.chia`.
- The typed contract is `types/index.d.ts`; the tests in `tests/` are executable conformance vectors.
