/**
 * @dignetwork/chia-provider — the canonical DIG `window.chia` wallet provider.
 *
 * This package is the SINGLE SOURCE OF TRUTH for the injected provider surface a dApp
 * sees as `window.chia`, shared by the DIG Browser (native in-process bridge) and the
 * dig-chrome-extension (WalletConnect→Sage). It is transport-agnostic: `buildProvider`
 * takes a `bridgeCall(method, params) → {status, body}` and returns the provider object;
 * each consumer supplies its own transport.
 *
 * The surface is a SUPERSET compatible with:
 *   - CHIP-0002 (the Chia wallet standard) — request({method, params})
 *   - Goby (dexie.space, tibetswap, …) — identity flags (isGoby) + direct methods on the
 *     object (provider.getPublicKeys(), .transfer(), …) + requestAccounts/accounts
 *   - Sage's WalletConnect2 method names — routed via the alias table
 *
 * See SPEC.md for the normative contract and types/index.d.ts for the typed interface.
 */
export {
  WALLET_PROVIDER_VERSION,
  WALLET_PROVIDER_NAME,
  WALLET_API_VERSION,
  WALLET_CHAIN_ID,
  PROVIDER_INFO,
  PROVIDER_ERROR_CODES,
  mapEnvelopeToError,
  buildProvider,
} from './provider.mjs';

export {
  CHIP0002_METHODS,
  CHIA_METHODS,
  WALLET_METHODS,
  STATE_CHANGING_METHODS,
  GOBY_ALIASES,
  normalizeMethod,
  remapGobyParams,
  isSupportedMethod,
  isStateChanging,
} from './methods.mjs';
