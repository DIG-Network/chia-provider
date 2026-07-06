// Type contract for the DIG `window.chia` provider (@dignetwork/chia-provider).
//
// The injected provider is a SUPERSET compatible with CHIP-0002, Goby, and Sage's
// WalletConnect2 method names. A Goby dApp feature-detects `isGoby`; a CHIP-0002 dApp
// uses `request({ method, params })`; a Goby-legacy dApp calls the direct methods.

export type ChainId = 'mainnet' | 'testnet11' | (string & {});
export type Hex = `0x${string}` | string;
export type Amount = number | string;

/** CHIP-0002 wallet provider error codes (+ 4900 disconnected, Goby convention). */
export interface ProviderErrorCodes {
  /** 4000 — invalid method params. */
  INVALID_PARAMS: 4000;
  /** 4001 — the origin/account is not authorized (call connect() first). */
  UNAUTHORIZED: 4001;
  /** 4002 — the user rejected the request (or a connect approval timed out). */
  USER_REJECTED: 4002;
  /** 4003 — the requested spend exceeds the spendable balance. */
  SPENDABLE_BALANCE_EXCEEDED: 4003;
  /** 4004 — the wallet does not support / cannot find the requested method. */
  METHOD_NOT_FOUND: 4004;
  /** 4005 — the wallet does not own a required secret key. */
  NO_SECRET_KEY: 4005;
  /** 4029 — too many requests (rate limited). */
  LIMIT_EXCEEDED: 4029;
  /** 4900 — the wallet is disconnected / not connected. */
  DISCONNECTED: 4900;
}

export interface ProviderError extends Error {
  code: number;
  /** Set on a 202 pending-approval so connect()'s retry loop polls. */
  pending?: boolean;
  /** The raw transport status the broker returned, when available. */
  status?: number;
}

/** Self-describing capability object exposed as `window.chia.info`. */
export interface ProviderInfo {
  isDIG: true;
  /** 'injected' (extension serves via its self-custody vault) | 'native' (in-process browser bridge). */
  transport: 'injected' | 'native' | (string & {});
  /** 'extension' | 'browser'. */
  edition: 'extension' | 'browser' | (string & {});
  providerVersion: number;
  scheme?: string;
  version?: string;
}

export interface RequestArguments {
  method: string;
  params?: unknown;
}

/** The transport hook a consumer injects: one round-trip to the wallet broker. */
export type BridgeCall = (
  method: string,
  params?: unknown,
  timeoutMs?: number,
) => Promise<{ status: number; body?: { data?: unknown; error?: string }; error?: string } | null | undefined>;

export interface BuildProviderDeps {
  bridgeCall: BridgeCall;
  version?: string;
  /** Optional event emitter override (defaults to the internal listener registry). */
  emit?: (event: string, data?: unknown) => void;
}

/**
 * The injected `window.chia` object. A SUPERSET of CHIP-0002 + Goby + Sage-WC2:
 *  - CHIP-0002:      request({ method, params })
 *  - Goby identity:  isDIG, isGoby, name, version, apiVersion
 *  - Goby-legacy:    direct methods (getPublicKeys(), transfer(), createOffer(), …)
 *  - Goby accounts:  requestAccounts() / accounts()
 *  - events:         on/off/removeListener ('connect' | 'chainChanged' | 'accountChanged')
 */
export interface ChiaProvider {
  readonly isDIG: true;
  readonly isGoby: true;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: string;
  readonly info: ProviderInfo;
  readonly methods: string[];
  readonly errorCodes: ProviderErrorCodes;
  readonly chainId?: ChainId;
  readonly selectedAddress?: string;
  isConnected(): boolean;

  request<T = unknown>(args: RequestArguments): Promise<T>;

  /** CHIP-0002/Goby connect — resolves `true` on success. `scope` requests least privilege. */
  connect(params?: { eager?: boolean; scope?: 'full' | 'read-only' } | boolean): Promise<boolean>;
  walletSwitchChain(params: { chainId: ChainId }): Promise<null>;
  walletWatchAsset(params: unknown): Promise<unknown>;
  getPublicKeys(params?: unknown): Promise<Hex[]>;
  filterUnlockedCoins(params: unknown): Promise<Hex[]>;
  getAssetCoins(params: unknown): Promise<unknown>;
  getAssetBalance(params: unknown): Promise<unknown>;
  signCoinSpends(params: unknown): Promise<Hex>;
  signMessage(params: unknown): Promise<Hex>;
  signMessageByAddress(params: unknown): Promise<unknown>;
  transfer(params: { to?: string; address?: string; amount: Amount; assetId?: Hex; memos?: Hex[]; fee?: Amount }): Promise<unknown>;
  sendTransaction(params: unknown): Promise<unknown>;
  createOffer(params: unknown): Promise<unknown>;
  takeOffer(params: unknown): Promise<unknown>;
  cancelOffer(params: unknown): Promise<unknown>;
  getNFTs(params?: unknown): Promise<unknown>;
  getNFTInfo(params: unknown): Promise<unknown>;
  requestAccounts(): Promise<string[]>;
  accounts(): Promise<string[]>;

  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export const WALLET_PROVIDER_VERSION: number;
export const WALLET_PROVIDER_NAME: string;
export const WALLET_API_VERSION: string;
export const WALLET_CHAIN_ID: ChainId;
export const PROVIDER_INFO: ProviderInfo;
export const PROVIDER_ERROR_CODES: ProviderErrorCodes;
export function mapEnvelopeToError(env: unknown): ProviderError;
export function buildProvider(deps: BuildProviderDeps): ChiaProvider;

export const CHIP0002_METHODS: string[];
export const CHIA_METHODS: string[];
export const WALLET_METHODS: string[];
export const STATE_CHANGING_METHODS: Set<string>;
export const GOBY_ALIASES: Readonly<Record<string, string>>;
export function normalizeMethod(method: string): string;
export function remapGobyParams(method: string, params: unknown): unknown;
export function isSupportedMethod(method: string): boolean;
export function isStateChanging(method: string): boolean;
