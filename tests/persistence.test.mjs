import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';

// Exercise the actual shipped save/refresh functions with controlled network timing.
const frontend = readFileSync(process.env.TARGET_FRONTEND || new URL('../frontend.js', import.meta.url), 'utf8');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const clone = structuredClone;
const initial = () => ({ version: 1, personas: { p: { groups: [{ id: 'old', name: 'Old', addonIds: ['a'] }], ungroupedOrder: ['b'], tagRules: {}, collapsedGroupIds: [] } } });
async function harness() {
  let server = initial();
  const reads = [], writes = [];
  let nextRead;
  const response = value => ({ ok: true, json: async () => clone(value) });
  const context = {
    structuredClone, console,
    document: { querySelector: () => null, dispatchEvent: () => {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    requestAnimationFrame: () => {},
    fetch: async (path, options = {}) => {
      if (path.includes('personaAddonOrganizer')) {
        if (options.method === 'PUT') {
          const request = deferred();
          const snapshot = JSON.parse(options.body).value;
          writes.push({ snapshot, resolve() { server = clone(snapshot); request.resolve(response({})); }, reject: request.reject });
          return request.promise;
        }
        if (nextRead) {
          const request = nextRead;
          nextRead = undefined;
          reads.push(request);
          return request.promise;
        }
        return response({ value: server });
      }
      if (path.startsWith('/api/v1/personas')) return response([{ id: 'p', metadata: { addons: [{ id: 'a' }, { id: 'b' }] } }]);
      if (path.includes('/settings/')) return response({ value: '' });
      return response([]);
    }
  };
  let source = frontend.replace('  const observer = new MutationObserver(queueScan);', '  globalThis.api = { refreshData, mutateLayout, settings: () => structuredClone(settings), saved: () => saveChain }; return;\n  const observer = new MutationObserver(queueScan);');
  source = source.replace(/export\s*\{\s*setup\s*\};?\s*$/, '');
  runInNewContext(source + '\nsetup({dom:{addStyle:()=>()=>{}}});', context);
  const api = context.api;
  assert.ok(api, 'test hooks attach to shipped setup');
  await api.refreshData();
  return { api, writes, server: () => clone(server),
    holdRead() { const request = deferred(); nextRead = request; return { resolve: value => request.resolve(response({ value })), reject: request.reject }; },
    async drain() { let index = 0; await tick(); while (index < writes.length) { writes[index++].resolve(); await tick(); } await api.saved(); }
  };
}
function reorganize(api) {
  api.mutateLayout('p', draft => { draft.ungroupedOrder.push(...draft.groups[0].addonIds); draft.groups = []; }, 'Group deleted');
  api.mutateLayout('p', draft => { draft.groups.push({ id: 'new', name: 'New', addonIds: [] }); }, 'Group added');
  api.mutateLayout('p', draft => { draft.ungroupedOrder = draft.ungroupedOrder.filter(id => id !== 'b'); draft.groups[0].addonIds.push('b'); }, 'Add-on moved');
}
function assertReorganized(settings) {
  assert.deepEqual(settings.personas.p.groups, [{ id: 'new', name: 'New', addonIds: ['b'] }]);
  assert.deepEqual(settings.personas.p.ungroupedOrder, ['a']);
}

test('delete, recreate and move survive a read started before the edits and a subsequent reload', async () => {
  const h = await harness();
  const read = h.holdRead(), refresh = h.api.refreshData();
  await tick();
  reorganize(h.api);
  read.resolve(initial());
  await refresh;
  assertReorganized(h.api.settings());
  await h.drain();
  assertReorganized(h.server());
  await h.api.refreshData();
  assertReorganized(h.api.settings());
});
test('a stale refresh started during pending saves cannot undo them after the queue drains', async () => {
  const h = await harness();
  reorganize(h.api);
  const read = h.holdRead(), refresh = h.api.refreshData();
  await tick();
  await h.drain();
  read.resolve(initial());
  await refresh;
  assertReorganized(h.api.settings());
});
test('failed settings refresh preserves the last known layout', async () => {
  const h = await harness();
  const read = h.holdRead(), refresh = h.api.refreshData();
  await tick(); read.reject(new Error('offline')); await refresh;
  assert.deepEqual(h.api.settings(), initial());
});
test('failed saves retain edits through refresh and a later edit retries the full layout', async () => {
  const h = await harness();
  h.api.mutateLayout('p', draft => { draft.groups[0].name = 'Renamed'; }, 'Renamed');
  await tick(); h.writes[0].reject(new Error('offline')); await h.api.saved();
  await h.api.refreshData();
  assert.equal(h.api.settings().personas.p.groups[0].name, 'Renamed');
  h.api.mutateLayout('p', draft => { draft.groups.push({ id: 'next', name: 'Next', addonIds: [] }); }, 'Added');
  await tick(); h.writes[1].resolve(); await h.api.saved();
  assert.equal(h.server().personas.p.groups[0].name, 'Renamed');
  assert.equal(h.server().personas.p.groups.length, 2);
});
test('an older refresh finishing late cannot replace a newer response', async () => {
  const h = await harness();
  const firstRead = h.holdRead(), first = h.api.refreshData(); await tick();
  const secondRead = h.holdRead(), second = h.api.refreshData(); await tick();
  const newer = initial(); newer.personas.p.groups[0].name = 'Other device';
  secondRead.resolve(newer); await second;
  firstRead.resolve(initial()); await first;
  assert.equal(h.api.settings().personas.p.groups[0].name, 'Other device');
});
test('an idle successful refresh still accepts externally saved layouts', async () => {
  const h = await harness();
  const read = h.holdRead(), refresh = h.api.refreshData(); await tick();
  const newer = initial(); newer.personas.p.groups[0].name = 'External';
  read.resolve(newer); await refresh;
  assert.equal(h.api.settings().personas.p.groups[0].name, 'External');
});

