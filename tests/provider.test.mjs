/**
 * Tests for the injected window.chia provider's self-describing surface + error contract.
 *
 * Before this pass the injected provider exposed only isDIG/isConnected/request/connect/on/off
 * — a dapp or agent had to hard-code the method list and could not feature-detect the version
 * or transport. And thrown errors used ad-hoc sentinels (-1, raw HTTP status) with no
 * documented meaning. This pass adds:
 *   - window.chia.version / .info{isDIG,transport,edition}
 *   - window.chia.methods (the WALLET_METHODS catalogue) + a chip0002_getMethods request
 *   - a documented CHIP-0002 thrown-error code contract (4000/4001/4002/4004/4005/4029/4900) —
 *     the same codes the native DIG Browser provider uses, so the two stay byte-aligned.
 *
 * The provider's pure logic is factored into buildProvider() in dig-provider-core.mjs so it
 * is unit-testable under `node --test` without a DOM. dig-provider.js (the injected IIFE)
 * imports nothing — it inlines the same surface — so this test pins the core that the IIFE
 * mirrors via a structure assertion.
 *
 * Run: node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WALLET_PROVIDER_VERSION,
  PROVIDER_INFO,
  PROVIDER_ERROR_CODES,
  buildProvider,
  mapEnvelopeToError,
} from '../src/provider.mjs';
import { WALLET_METHODS } from '../src/methods.mjs';

test('PROVIDER_INFO advertises a self-describing capability object', () => {
  assert.equal(PROVIDER_INFO.isDIG, true);
  assert.equal(PROVIDER_INFO.transport, 'injected'); // no WalletConnect — served in-extension
  assert.equal(PROVIDER_INFO.edition, 'extension');
});

test('PROVIDER_ERROR_CODES are the CHIP-0002 wallet codes', () => {
  // The CHIP-0002 set — a CHIP-0002/Goby dApp branches on err.code identically; byte-aligned
  // with the native DIG Browser provider.
  assert.equal(PROVIDER_ERROR_CODES.INVALID_PARAMS, 4000);
  assert.equal(PROVIDER_ERROR_CODES.UNAUTHORIZED, 4001);
  assert.equal(PROVIDER_ERROR_CODES.USER_REJECTED, 4002);
  assert.equal(PROVIDER_ERROR_CODES.SPENDABLE_BALANCE_EXCEEDED, 4003);
  assert.equal(PROVIDER_ERROR_CODES.METHOD_NOT_FOUND, 4004);
  assert.equal(PROVIDER_ERROR_CODES.NO_SECRET_KEY, 4005);
  assert.equal(PROVIDER_ERROR_CODES.LIMIT_EXCEEDED, 4029);
  assert.equal(PROVIDER_ERROR_CODES.DISCONNECTED, 4900);
});

test('buildProvider exposes version, info, and a methods catalogue', () => {
  const provider = buildProvider({ bridgeCall: async () => ({ status: 200, body: { data: {} } }), version: '1.2.3' });
  assert.equal(provider.isDIG, true);
  assert.equal(provider.version, '1.2.3');
  assert.deepEqual(provider.info, PROVIDER_INFO);
  assert.deepEqual(provider.methods, WALLET_METHODS);
  assert.equal(typeof provider.request, 'function');
  assert.equal(typeof provider.connect, 'function');
  assert.equal(typeof provider.on, 'function');
  assert.equal(typeof provider.off, 'function');
});

test('request({method:"chip0002_getMethods"}) returns the method catalogue locally', async () => {
  let called = false;
  const provider = buildProvider({
    bridgeCall: async () => { called = true; return { status: 200, body: { data: {} } }; },
    version: '1.0.0',
  });
  const methods = await provider.request({ method: 'chip0002_getMethods' });
  assert.deepEqual(methods, WALLET_METHODS);
  assert.equal(called, false, 'getMethods must be answered locally, not over the bridge');
});

test('mapEnvelopeToError: a 202 pending maps to USER_REJECTED (4002) + pending flag', () => {
  const e = mapEnvelopeToError({ status: 202, body: {} });
  assert.equal(e.code, 4002);
  assert.equal(e.pending, true);
});

test('mapEnvelopeToError: a 400 maps to INVALID_PARAMS (4000)', () => {
  const e = mapEnvelopeToError({ status: 400, body: { error: 'bad params' } });
  assert.equal(e.code, 4000);
});

test('mapEnvelopeToError: a 401 maps to UNAUTHORIZED (4001)', () => {
  const e = mapEnvelopeToError({ status: 401, body: { error: 'Origin not connected' } });
  assert.equal(e.code, 4001);
});

test('mapEnvelopeToError: a 404 maps to METHOD_NOT_FOUND (4004)', () => {
  const e = mapEnvelopeToError({ status: 404, body: { error: 'Unsupported method: chip0002_foo' } });
  assert.equal(e.code, 4004);
});

test('mapEnvelopeToError: a 429 maps to LIMIT_EXCEEDED (4029)', () => {
  const e = mapEnvelopeToError({ status: 429, body: { error: 'slow down' } });
  assert.equal(e.code, 4029);
});

test('mapEnvelopeToError: a 503/502 maps to DISCONNECTED (4900)', () => {
  assert.equal(mapEnvelopeToError({ status: 503, body: {} }).code, 4900);
  assert.equal(mapEnvelopeToError({ status: 502, body: { error: 'relay' } }).code, 4900);
});

test('mapEnvelopeToError: an absent envelope maps to DISCONNECTED (4900), not a sentinel -1', () => {
  const e = mapEnvelopeToError(null);
  assert.equal(e.code, 4900);
});

test('request resolves body.data on a 200', async () => {
  const provider = buildProvider({
    bridgeCall: async () => ({ status: 200, body: { data: { address: 'xch1...' } } }),
    version: '1.0.0',
  });
  const r = await provider.request({ method: 'chip0002_getPublicKeys' });
  assert.deepEqual(r, { address: 'xch1...' });
});

test('request throws an error carrying a standard code on a 4xx', async () => {
  const provider = buildProvider({
    bridgeCall: async () => ({ status: 401, body: { error: 'nope' } }),
    version: '1.0.0',
  });
  await assert.rejects(
    () => provider.request({ method: 'chip0002_getPublicKeys' }),
    (e) => { assert.equal(e.code, 4001); return true; }
  );
});

// ─── Goby / CHIP-0002 / Sage-WC2 compatibility (Reference Wallet B window.chia parity) ──────
// A dApp built for Goby / Sage's WC2 API expects: identity flags (isGoby), Goby-legacy
// DIRECT methods on the object (provider.getPublicKeys(), .transfer(), …) rather than
// only request({method}), the requestAccounts/accounts helpers, walletSwitchChain, and
// isConnected() as a callable. buildProvider must expose all of these as a SUPERSET of
// the existing DIG surface.

/** A bridgeCall spy that records (method, params) and returns canned data per method. */
function spyBridge() {
  const calls = [];
  const bridgeCall = async (method, params) => {
    calls.push({ method, params });
    if (method === 'chia_getAddress') return { status: 200, body: { data: { address: 'xch1testaddr' } } };
    if (method === 'chia_send') return { status: 200, body: { data: { id: '0xspend' } } };
    if (method === 'chip0002_connect') return { status: 200, body: { data: true } };
    return { status: 200, body: { data: {} } };
  };
  return { calls, bridgeCall };
}

test('provider advertises Goby identity flags (isGoby/name/apiVersion) alongside isDIG', () => {
  const { bridgeCall } = spyBridge();
  const p = buildProvider({ bridgeCall, version: '1.0.0' });
  assert.equal(p.isDIG, true);
  assert.equal(p.isGoby, true);
  assert.equal(typeof p.name, 'string');
  assert.ok(p.name.length > 0);
  assert.equal(typeof p.apiVersion, 'string');
});

test('isConnected() is a callable that flips true after connect', async () => {
  const { bridgeCall } = spyBridge();
  const p = buildProvider({ bridgeCall, version: '1.0.0' });
  assert.equal(typeof p.isConnected, 'function');
  assert.equal(p.isConnected(), false);
  await p.connect();
  assert.equal(p.isConnected(), true);
  assert.equal(p.chainId, 'mainnet'); // DIG is Chia mainnet
});

test('Goby-legacy direct methods exist on the provider object', () => {
  const { bridgeCall } = spyBridge();
  const p = buildProvider({ bridgeCall, version: '1.0.0' });
  for (const m of [
    'connect', 'getPublicKeys', 'filterUnlockedCoins', 'getAssetCoins', 'getAssetBalance',
    'signCoinSpends', 'signMessage', 'transfer', 'sendTransaction', 'createOffer', 'takeOffer',
    'cancelOffer', 'signMessageByAddress', 'getNFTs', 'getNFTInfo', 'walletSwitchChain',
    'walletWatchAsset', 'requestAccounts', 'accounts',
  ]) {
    assert.equal(typeof p[m], 'function', `${m} is a direct method`);
  }
});

test('request({method:"transfer"}) routes to chia_send with to→address remap', async () => {
  const { calls, bridgeCall } = spyBridge();
  const p = buildProvider({ bridgeCall, version: '1.0.0' });
  await p.request({ method: 'transfer', params: { to: 'xch1dest', amount: 7, fee: 1 } });
  const sent = calls.find((c) => c.method === 'chia_send');
  assert.ok(sent, 'transfer must reach the broker as chia_send');
  assert.deepEqual(sent.params, { amount: 7, fee: 1, address: 'xch1dest' });
});

test('the direct transfer() method routes identically to request', async () => {
  const { calls, bridgeCall } = spyBridge();
  const p = buildProvider({ bridgeCall, version: '1.0.0' });
  await p.transfer({ to: 'xch1dest2', amount: 3 });
  const sent = calls.find((c) => c.method === 'chia_send');
  assert.ok(sent);
  assert.deepEqual(sent.params, { amount: 3, address: 'xch1dest2' });
});

test('request({method:"getPublicKeys"}) routes to chip0002_getPublicKeys', async () => {
  const { calls, bridgeCall } = spyBridge();
  const p = buildProvider({ bridgeCall, version: '1.0.0' });
  await p.request({ method: 'getPublicKeys' });
  assert.ok(calls.some((c) => c.method === 'chip0002_getPublicKeys'));
});

test('requestAccounts() connects then returns the address list + caches selectedAddress', async () => {
  const { bridgeCall } = spyBridge();
  const p = buildProvider({ bridgeCall, version: '1.0.0' });
  const accts = await p.requestAccounts();
  assert.deepEqual(accts, ['xch1testaddr']);
  assert.equal(p.isConnected(), true);
  assert.equal(p.selectedAddress, 'xch1testaddr');
});

test('accounts() throws 4900 when not connected, returns addresses once connected', async () => {
  const { bridgeCall } = spyBridge();
  const p = buildProvider({ bridgeCall, version: '1.0.0' });
  await assert.rejects(() => p.accounts(), (e) => { assert.equal(e.code, 4900); return true; });
  await p.connect();
  assert.deepEqual(await p.accounts(), ['xch1testaddr']);
});

test('walletSwitchChain accepts mainnet locally and rejects other chains as unsupported', async () => {
  const { calls, bridgeCall } = spyBridge();
  const p = buildProvider({ bridgeCall, version: '1.0.0' });
  assert.equal(await p.walletSwitchChain({ chainId: 'mainnet' }), null);
  assert.equal(calls.length, 0, 'mainnet switch is answered locally, no bridge call');
  await assert.rejects(
    () => p.walletSwitchChain({ chainId: 'testnet11' }),
    (e) => { assert.equal(e.code, 4004); return true; },
  );
});

test('every Goby-legacy direct method routes to the expected broker method', async () => {
  const { calls, bridgeCall } = spyBridge();
  const p = buildProvider({ bridgeCall, version: '1.0.0' });
  // dApp-facing direct method → the broker method it must dispatch to.
  const routing = {
    getPublicKeys: 'chip0002_getPublicKeys',
    filterUnlockedCoins: 'chip0002_filterUnlockedCoins',
    getAssetCoins: 'chip0002_getAssetCoins',
    getAssetBalance: 'chip0002_getAssetBalance',
    signCoinSpends: 'chip0002_signCoinSpends',
    signMessage: 'chip0002_signMessage',
    signMessageByAddress: 'chia_signMessageByAddress',
    sendTransaction: 'chia_sendTransaction',
    createOffer: 'chia_createOffer',
    takeOffer: 'chia_takeOffer',
    cancelOffer: 'chia_cancelOffer',
    getNFTs: 'chia_getNfts',
    getNFTInfo: 'chia_getNftInfo',
    walletWatchAsset: 'chia_walletWatchAsset',
  };
  for (const [method, broker] of Object.entries(routing)) {
    await p[method]({});
    assert.ok(calls.some((c) => c.method === broker), `${method} must dispatch ${broker}`);
  }
});

test('on/off/removeListener accept chainChanged and accountChanged without throwing', () => {
  const { bridgeCall } = spyBridge();
  const p = buildProvider({ bridgeCall, version: '1.0.0' });
  const fn = () => {};
  assert.doesNotThrow(() => p.on('chainChanged', fn));
  assert.doesNotThrow(() => p.on('accountChanged', fn));
  assert.equal(typeof p.removeListener, 'function');
  assert.doesNotThrow(() => p.removeListener('chainChanged', fn));
  assert.doesNotThrow(() => p.off('accountChanged', fn));
});
