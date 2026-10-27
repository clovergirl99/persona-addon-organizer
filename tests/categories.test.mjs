import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { parseHTML } = createRequire(import.meta.url)('linkedom');
const frontend = readFileSync(new URL('../frontend.js', import.meta.url), 'utf8');
const labels = ['Young adult', 'Shy', 'Uniform', 'Extra', 'Loose'];
const base = () => ({ version: 1, personas: { p: {
  categories: [{ id: 'main', name: 'Main' }, { id: 'appearance', name: 'Appearance' }],
  groups: [
    { id: 'ages', name: 'Ages', addonIds: ['a'], categoryId: 'main' },
    { id: 'traits', name: 'Personality', addonIds: ['b'], categoryId: 'main' },
    { id: 'clothes', name: 'Clothes', addonIds: ['c'], categoryId: 'appearance' },
    { id: 'extra', name: 'Extras', addonIds: ['d'], categoryId: '' }
  ], ungroupedOrder: ['e'], tagRules: {}, collapsedGroupIds: [], collapsedCategoryIds: []
} } });
async function harness(initial = base()) {
  const { document, window } = parseHTML('<html><body><div role="dialog"><div id="editor" class="_body_test"></div></div><div id="popover"><div class="_addonPopoverHeader_test">Persona Add-Ons</div></div></body></html>');
  // Linkedom has only a select getter; supply the browser setter used by the app.
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    get() { return this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value ?? ''; },
    set(value) { for (const option of this.querySelectorAll('option')) { if (option.value === value) option.setAttribute('selected', ''); else option.removeAttribute('selected'); } }
  });
  const editor = document.getElementById('editor'), popover = document.getElementById('popover');
  labels.forEach((label, index) => {
    const card = document.createElement('div'); card.className = '_addonCard_test';
    const input = document.createElement('input'); input.className = '_addonLabelInput_test'; input.value = label; card.append(input); editor.append(card);
    const row = document.createElement('button'); row.className = '_popRowBtn_test'; row.dataset.addon = 'abcde'[index];
    const main = document.createElement('span'); main.className = '_personaMain_test'; const name = document.createElement('span'); name.textContent = label; main.append(name); row.append(main); popover.append(row);
  });
  let server = structuredClone(initial);
  const ctx = { dom: {
    addStyle: () => () => {},
    inject(target, html, position) { const host = document.createElement('div'); host.dataset.spindleExt = 'persona_addon_organizer'; host.innerHTML = html; target.insertAdjacentElement(position, host); return host; },
    uninject: element => element.remove()
  }, ui: { showConfirm: async () => ({ confirmed: true }) } };
  const context = { document, window, console, structuredClone, requestAnimationFrame: () => {}, CustomEvent: window.CustomEvent,
    fetch: async (path, options = {}) => {
      let value;
      if (path.includes('personaAddonOrganizer')) { if (options.method === 'PUT') server = JSON.parse(options.body).value; value = { value: server }; }
      else if (path.startsWith('/api/v1/personas')) value = [{ id: 'p', name: 'Test', metadata: { addons: labels.map((label, index) => ({ id: 'abcde'[index], label })) } }];
      else if (path.includes('/settings/')) value = { value: '' };
      else value = [];
      return { ok: true, json: async () => structuredClone(value) };
    }
  };
  let source = frontend.replace('  const observer = new MutationObserver(queueScan);', '  globalThis.api = { refreshData, mountEditor, mountChatPopover, layoutFor, mutateLayout, settings: () => structuredClone(settings), saved: () => saveChain }; return;\n  const observer = new MutationObserver(queueScan);');
  source = source.replace(/export\s*\{\s*setup\s*\};?\s*$/, '');
  context.ctx = ctx; runInNewContext(source + '\nsetup(ctx);', context);
  const api = context.api; await api.refreshData();
  const click = element => { assert.ok(element, 'control exists'); element.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })); };
  const change = (element, value) => { element.value = value; element.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const shown = () => [...popover.querySelectorAll('button[data-addon]')].filter(row => !row.classList.contains('pao-category-hidden') && !row.classList.contains('pao-collapsed-item')).map(row => row.dataset.addon);
  const chip = text => [...popover.querySelectorAll('.pao-category-chip')].find(button => button.textContent.startsWith(text + ' ('));
  return { api, editor, popover, document, window, click, change, shown, chip, server: () => server };
}

test('toolbar chips filter categories and All restores every add-on', async () => {
  const h = await harness(); h.api.mountChatPopover(h.popover);
  assert.deepEqual([...h.popover.querySelectorAll('.pao-category-chip')].map(item => item.textContent), ['All (5)', 'Main (2)', 'Appearance (1)', 'Uncategorized (2)']);
  assert.deepEqual(h.shown(), ['a', 'b', 'c', 'd', 'e']);
  h.click(h.chip('Main')); assert.deepEqual(h.shown(), ['a', 'b']);
  assert.equal(h.chip('Main').getAttribute('aria-pressed'), 'true');
  h.click(h.chip('Uncategorized')); assert.deepEqual(h.shown(), ['d', 'e']);
  h.click(h.chip('All')); assert.deepEqual(h.shown(), ['a', 'b', 'c', 'd', 'e']);
});
test('category collapse hides its groups and rows and survives rebuilding the native menu', async () => {
  const h = await harness(); h.api.mountChatPopover(h.popover);
  h.click([...h.popover.querySelectorAll('.pao-chat-category')].find(item => item.textContent.includes('Main')));
  assert.deepEqual(h.shown(), ['c', 'd', 'e']);
  h.api.mountChatPopover(h.popover);
  assert.deepEqual(h.shown(), ['c', 'd', 'e']);
  assert.equal(h.popover.querySelectorAll('.pao-category-filters').length, 1);
  assert.equal([...h.popover.querySelectorAll('.pao-chat-group')].find(item => item.textContent.includes('Ages')).closest('[data-spindle-ext]').classList.contains('pao-category-hidden'), true);
  h.click([...h.popover.querySelectorAll('.pao-chat-category')].find(item => item.textContent.includes('Main')));
  assert.deepEqual(h.shown(), ['a', 'b', 'c', 'd', 'e']);
});
test('group collapse remains independent from the parent category and filter', async () => {
  const h = await harness(); h.api.mountChatPopover(h.popover);
  h.click([...h.popover.querySelectorAll('.pao-chat-group')].find(item => item.textContent.includes('Ages')));
  h.click(h.chip('Appearance')); assert.deepEqual(h.shown(), ['c']);
  h.click(h.chip('Main')); assert.deepEqual(h.shown(), ['b']);
  h.api.mountChatPopover(h.popover); assert.deepEqual(h.shown(), ['b']);
});
test('legacy groups migrate intact under Uncategorized with no category bar until a category exists', async () => {
  const legacy = base(); delete legacy.personas.p.categories; delete legacy.personas.p.collapsedCategoryIds;
  for (const group of legacy.personas.p.groups) delete group.categoryId;
  const h = await harness(legacy); h.api.mountChatPopover(h.popover);
  assert.equal(h.popover.querySelector('.pao-category-filters'), null);
  assert.deepEqual(h.shown(), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(h.api.layoutFor('p').groups.length, 4);
});
test('editor creates categories and moves existing folders without moving or dropping their add-ons', async () => {
  const h = await harness(); h.api.mountEditor(h.editor);
  h.editor.querySelector('[aria-label="New category name"]').value = 'Story';
  h.click([...h.editor.querySelectorAll('.pao-category-manager button')].find(item => item.textContent === 'Add category'));
  const category = h.api.layoutFor('p').categories.find(item => item.name === 'Story'); assert.ok(category);
  h.change(h.editor.querySelector('[aria-label="Category for Ages"]'), category.id);
  assert.deepEqual(structuredClone(h.api.layoutFor('p').groups.find(item => item.id === 'ages').addonIds), ['a']);
  assert.equal(h.api.layoutFor('p').groups.find(item => item.id === 'ages').categoryId, category.id);
  h.api.mountChatPopover(h.popover); h.click(h.chip('Story')); assert.deepEqual(h.shown(), ['a']);
  await h.api.saved(); assert.equal(h.server().personas.p.groups.find(item => item.id === 'ages').categoryId, category.id);
});
test('deleting a category retains its groups, memberships and tag rules', async () => {
  const data = base(); data.personas.p.tagRules.a = ['School'];
  const h = await harness(data); h.api.mountEditor(h.editor);
  h.click(h.editor.querySelector('.pao-category-row .pao-btn-danger'));
  await Promise.resolve();
  const layout = h.api.layoutFor('p');
  assert.equal(layout.categories.some(item => item.id === 'main'), false);
  assert.equal(layout.groups.length, 4);
  assert.equal(layout.groups.find(item => item.id === 'ages').categoryId, '');
  assert.deepEqual(structuredClone(layout.tagRules.a), ['School']);
  h.api.mountChatPopover(h.popover); h.click(h.chip('Uncategorized')); assert.deepEqual(h.shown(), ['a', 'b', 'd', 'e']);
});
test('category names are rendered as text and removed categories do not leave a stale filter', async () => {
  const h = await harness(); h.api.mountEditor(h.editor);
  h.change(h.editor.querySelector('[aria-label="Category name"]'), '<img src=x onerror=alert(1)>');
  h.api.mountChatPopover(h.popover);
  assert.equal(h.popover.querySelector('img'), null);
  h.click(h.chip('<img src=x onerror=alert(1)>'));
  h.api.mutateLayout('p', draft => { draft.categories = draft.categories.filter(item => item.id !== 'main'); }, 'Deleted');
  h.api.mountChatPopover(h.popover);
  assert.equal(h.chip('All').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(h.shown(), ['a', 'b', 'c', 'd', 'e']);
});

test('new groups use the chosen category and category order is reflected in toolbar chips', async () => {
  const h = await harness(); h.api.mountEditor(h.editor);
  h.change(h.editor.querySelector('[aria-label="Category name"]'), 'Basics');
  h.click(h.editor.querySelector('.pao-category-row [aria-label="Move category down"]'));
  const input = h.editor.querySelector('.pao-add-group .pao-input'); input.value = 'New folder';
  h.editor.querySelector('[aria-label="New group category"]').value = 'appearance';
  h.click(h.editor.querySelector('.pao-add-group .pao-btn-primary'));
  const layout = h.api.layoutFor('p');
  assert.equal(layout.groups.at(-1).name, 'New folder');
  assert.equal(layout.groups.at(-1).categoryId, 'appearance');
  h.api.mountChatPopover(h.popover);
  assert.deepEqual([...h.popover.querySelectorAll('.pao-category-chip')].slice(0, 3).map(item => item.textContent), ['All (5)', 'Appearance (1)', 'Basics (2)']);
});

export { harness };

