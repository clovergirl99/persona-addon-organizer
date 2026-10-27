// src/model.ts
var EMPTY_SETTINGS = { version: 1, personas: {} };
function uniqueStrings(value) {
  if (!Array.isArray(value))
    return [];
  const seen = new Set;
  const result = [];
  for (const item of value) {
    if (typeof item !== "string")
      continue;
    const clean = item.trim();
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key))
      continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}
function normalizeLayout(value, addonIds) {
  const raw = value && typeof value === "object" ? value : {};
  const categories = [];
  const categoryIds = new Set;
  for (const item of Array.isArray(raw.categories) ? raw.categories : []) {
    if (!item || typeof item !== "object") continue;
    let id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || id === "__uncategorized__" || categoryIds.has(id)) {
      let index = categories.length + 1;
      while (categoryIds.has("category-" + index)) index++;
      id = "category-" + index;
    }
    categoryIds.add(id);
    categories.push({ id, name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Untitled category" });
  }
  const known = new Set(addonIds);
  const claimed = new Set;
  const groupIds = new Set;
  const groups = [];
  for (const item of Array.isArray(raw.groups) ? raw.groups : []) {
    if (!item || typeof item !== "object")
      continue;
    const candidate = item;
    let id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!id || groupIds.has(id))
      id = `group-${groups.length + 1}`;
    groupIds.add(id);
    const addonIdsInGroup = uniqueStrings(candidate.addonIds).filter((addonId) => known.has(addonId) && !claimed.has(addonId));
    addonIdsInGroup.forEach((addonId) => claimed.add(addonId));
    groups.push({ id, name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : "Untitled group", addonIds: addonIdsInGroup, categoryId: categoryIds.has(candidate.categoryId) ? candidate.categoryId : "" });
  }
  const ungroupedOrder = uniqueStrings(raw.ungroupedOrder).filter((addonId) => known.has(addonId) && !claimed.has(addonId));
  for (const addonId of addonIds) {
    if (!claimed.has(addonId) && !ungroupedOrder.includes(addonId))
      ungroupedOrder.push(addonId);
  }
  const tagRules = {};
  if (raw.tagRules && typeof raw.tagRules === "object") {
    for (const [addonId, tags] of Object.entries(raw.tagRules)) {
      if (!known.has(addonId))
        continue;
      const clean = uniqueStrings(tags);
      if (clean.length)
        tagRules[addonId] = clean;
    }
  }
  const validCollapseIds = new Set([...groups.map((group) => group.id), "__ungrouped__"]);
  const collapsedGroupIds = uniqueStrings(raw.collapsedGroupIds).filter((id) => validCollapseIds.has(id));
  const collapsedCategoryIds = uniqueStrings(raw.collapsedCategoryIds).filter(id => categoryIds.has(id) || id === "__uncategorized__");
  return { categories, groups, ungroupedOrder, tagRules, collapsedGroupIds, collapsedCategoryIds };
}
function categorySections(layout) {
  const sections = layout.categories.map(category => ({ ...category, groups: layout.groups.filter(group => group.categoryId === category.id) }));
  sections.push({ id: "__uncategorized__", name: "Uncategorized", groups: [
    ...layout.groups.filter(group => !group.categoryId),
    { id: "__ungrouped__", name: "Ungrouped", addonIds: layout.ungroupedOrder }
  ] });
  return sections;
}
function normalizeSettings(value) {
  const raw = value && typeof value === "object" ? value : {};
  const personas = raw.personas && typeof raw.personas === "object" ? raw.personas : {};
  return { version: 1, personas };
}
function resolveTagRuleStates(layout, characterTags) {
  const present = new Set(characterTags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean));
  const states = {};
  for (const [addonId, tags] of Object.entries(layout.tagRules)) {
    if (!tags.length)
      continue;
    states[addonId] = tags.some((tag) => present.has(tag.trim().toLocaleLowerCase()));
  }
  return states;
}
function moveItem(items, id, direction) {
  const index = items.indexOf(id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length)
    return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

// src/frontend.ts
var SETTING_KEY = "personaAddonOrganizer:v1";
var UNGROUPED_KEY = "__ungrouped__";
var CSS = `
  .pao-editor-tools{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--lumiverse-border);border-radius:10px;background:var(--lumiverse-fill-subtle);color:var(--lumiverse-text)}.pao-editor-title{font-size:12px;font-weight:700}.pao-help,.pao-status,.pao-empty{font-size:10.5px;line-height:1.4;color:var(--lumiverse-text-dim)}.pao-add-group{display:flex;gap:6px}.pao-input,.pao-select{min-width:0;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-bg);color:var(--lumiverse-text);font:inherit;font-size:11px;padding:6px 8px;outline:none}.pao-input{width:100%}.pao-input:focus,.pao-select:focus{border-color:var(--lumiverse-primary)}.pao-btn{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-bg-elevated);color:var(--lumiverse-text);font:inherit;font-size:10.5px;padding:5px 8px;cursor:pointer}.pao-btn:hover{border-color:var(--lumiverse-primary)}.pao-btn:disabled{opacity:.35;cursor:default}.pao-btn-primary{border-color:var(--lumiverse-primary);background:var(--lumiverse-primary);color:var(--lumiverse-primary-contrast,#fff)}.pao-btn-danger{color:var(--lumiverse-danger,#d66)}.pao-icon{width:25px;height:25px;padding:0}.pao-collapse{font-size:12px;flex:0 0 25px}.pao-bind-section{display:flex;flex-direction:column;gap:6px;margin-top:4px;padding-top:9px;border-top:1px solid var(--lumiverse-border)}.pao-profile-bind{display:flex;flex-direction:column;gap:6px;margin-top:4px;padding-top:9px;border-top:1px solid var(--lumiverse-border)}.pao-character-bind-row{display:flex;align-items:center;gap:7px;color:var(--lumiverse-text-dim);font-size:11px}.pao-character-bind-button{width:28px;height:28px;padding:0;flex:0 0 28px}.pao-character-select{flex:1}.pao-character-bind-label{max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pao-character-bind-button.pao-bound{border-color:var(--lumiverse-primary);color:var(--lumiverse-primary);background:var(--lumiverse-primary-015)}.pao-character-bind-label.pao-bound{color:var(--lumiverse-primary)}.pao-bind-title{font-size:11px;font-weight:700}.pao-bind-add{display:grid;grid-template-columns:minmax(110px,1fr) minmax(110px,1fr) auto;gap:6px}.pao-bind-rules{display:flex;flex-direction:column;gap:4px}.pao-bind-rule{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto;align-items:center;gap:6px;padding:5px 7px;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-bg)}.pao-bind-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px}.pao-bind-arrow{color:var(--lumiverse-text-dim)}.pao-group-heading{display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid var(--lumiverse-border);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--lumiverse-primary)}.pao-group-heading .pao-input{font-weight:700;text-transform:none}.pao-group-heading-actions{display:flex;gap:3px;margin-left:auto}.pao-card-controls{display:flex;flex-direction:column;gap:6px;padding-top:7px;border-top:1px dashed var(--lumiverse-border)}.pao-card-row{display:grid;grid-template-columns:minmax(110px,1fr) auto;gap:6px;align-items:center}.pao-order{display:flex;gap:3px}.pao-rule-label{font-size:10px;color:var(--lumiverse-text-dim)}.pao-chips{display:flex;flex-wrap:wrap;gap:4px}.pao-chip{display:inline-flex;align-items:center;gap:3px;border:1px solid var(--lumiverse-primary);border-radius:999px;color:var(--lumiverse-primary);font-size:10px;padding:3px 6px}.pao-chip button{border:0;background:none;color:inherit;padding:0;cursor:pointer}.pao-tag-add{display:flex;gap:5px}.pao-tag-add .pao-input{padding:5px 7px}.pao-native-section-hidden,.pao-collapsed-item{display:none!important}.pao-chat-group{width:100%;display:flex;align-items:center;gap:7px;padding:7px 10px 3px;border:0;border-top:1px solid var(--lumiverse-border);background:transparent;font:inherit;font-size:10px;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:.05em;color:var(--lumiverse-primary);cursor:pointer}.pao-chat-arrow{width:12px;text-align:center}
  .pao-category-manager{display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--lumiverse-border);padding-bottom:9px}.pao-category-create{display:flex;gap:6px}.pao-category-row{display:flex;gap:4px;align-items:center}.pao-category-row>.pao-input{flex:1}.pao-group-category{max-width:150px;font-size:10px}.pao-category-filters{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:5px;padding:8px 9px;order:1;background:var(--lumiverse-bg-elevated,var(--lumiverse-bg));border-bottom:1px solid var(--lumiverse-border)}.pao-category-chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;border:1px solid var(--lumiverse-border);border-radius:999px;background:transparent;color:var(--lumiverse-text-dim);font:inherit;font-size:10px;line-height:1.3;padding:4px 8px;cursor:pointer;overflow-wrap:anywhere}.pao-category-chip[aria-pressed="true"]{border-color:var(--lumiverse-primary);background:var(--lumiverse-primary-015,var(--lumiverse-fill-subtle));color:var(--lumiverse-primary)}.pao-chat-category{display:flex;align-items:center;gap:6px;padding:9px 10px 5px;border:0;background:var(--lumiverse-bg-elevated,var(--lumiverse-bg));color:var(--lumiverse-text-dim);font:inherit;font-size:10px;font-weight:700;text-transform:uppercase;text-align:left;cursor:pointer}.pao-category-dot{width:7px;height:7px;border-radius:50%;background:var(--lumiverse-primary);flex:0 0 auto}.pao-category-count{margin-left:auto;font-weight:400}.pao-category-hidden{display:none!important}.pao-chat-group.pao-nested-group{padding-left:20px;font-size:10px}.pao-chat-addon-nested{padding-left:28px!important}
  .pao-group-heading .pao-input{width:auto;min-width:90px;flex:1 1 110px}.pao-group-category{flex:0 1 140px;min-width:110px}.pao-group-heading-actions{flex-wrap:nowrap}.pao-add-group{flex-wrap:wrap}.pao-add-group .pao-input{flex:1;min-width:90px;width:auto}.pao-add-group .pao-btn,.pao-category-create .pao-btn{white-space:nowrap;flex:0 0 auto}
  @media(max-width:600px){.pao-editor-tools{padding:8px}.pao-bind-add{grid-template-columns:1fr}.pao-card-row{grid-template-columns:1fr}.pao-order{justify-content:flex-start}.pao-group-heading{flex-wrap:wrap}.pao-group-heading-actions{margin-left:0}}
`;
function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className)
    element.className = className;
  if (text !== undefined)
    element.textContent = text;
  return element;
}
function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
async function fetchJson(path, init) {
  const response = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json", ...init?.body ? { "Content-Type": "application/json" } : {} }, ...init });
  if (!response.ok)
    throw new Error(`Lumiverse returned ${response.status}`);
  return await response.json();
}
async function listAll(path) {
  const result = [];
  let offset = 0;
  for (;; ) {
    const raw = await fetchJson(`${path}${path.includes("?") ? "&" : "?"}limit=200&offset=${offset}`);
    if (Array.isArray(raw))
      return [...result, ...raw];
    const record = raw && typeof raw === "object" ? raw : {};
    const rows = ["data", "items", "personas", "addons", "results"].map((key) => record[key]).find(Array.isArray);
    if (!rows)
      throw new Error(`Unexpected list response from ${path}`);
    result.push(...rows);
    offset += rows.length;
    const total = typeof record.total === "number" ? record.total : offset;
    if (!rows.length || offset >= total)
      return result;
  }
}
function personaAddons(persona, globals) {
  const local = Array.isArray(persona.metadata?.addons) ? persona.metadata.addons : [];
  const refs = Array.isArray(persona.metadata?.attached_global_addons) ? persona.metadata.attached_global_addons : [];
  const globalById = new Map(globals.map((addon) => [addon.id, addon]));
  return [...local.map((addon) => ({ id: addon.id, label: addon.label || "Untitled add-on", enabled: addon.enabled, global: false })), ...refs.map((ref) => ({ id: ref.id, label: globalById.get(ref.id)?.label || "Missing global add-on", enabled: ref.enabled, global: true }))];
}
function currentChatId() {
  const mount = document.querySelector('[data-spindle-mount="chat_composer_above"][data-spindle-scope^="chat:"]');
  return mount?.dataset.spindleScope?.split(":")[1] || null;
}
function addonLabelFromChatButton(button) {
  const main = button.querySelector('[class*="_personaMain_"]');
  const spans = main ? [...main.querySelectorAll("span")] : [];
  return spans.at(-1)?.textContent?.trim() || "";
}
function setup(ctx) {
  const disposers = [ctx.dom.addStyle(CSS)];
  let settings = structuredClone(EMPTY_SETTINGS), personas = [], globals = [], characters = [], characterTags = [], activePersonaId = "", characterPersonaBindings = {};
  let saveChain = Promise.resolve(), automationBusy = false, lastAutomationSignature = "", scanQueued = false, destroyed = false;
  // Local edits own the layout until their newest queued write succeeds.
  let settingsRevision = 0, settingsDirty = false, refreshRevision = 0;
  const editorControllers = new Map;
  const chatControllers = new Map;
  const profileControllers = new Map;
  const chatCategoryFilters = new Map;
  const addonsFor = (personaId) => {
    const persona = personas.find((item) => item.id === personaId);
    return persona ? personaAddons(persona, globals) : [];
  };
  const layoutFor = (personaId) => {
    const layout = normalizeLayout(settings.personas[personaId], addonsFor(personaId).map((addon) => addon.id));
    settings.personas[personaId] = layout;
    return layout;
  };
  const saveSettings = (message) => {
    const snapshot = structuredClone(settings);
    const revision = ++settingsRevision;
    settingsDirty = true;
    saveChain = saveChain.then(() => fetchJson(`/api/v1/settings/${encodeURIComponent(SETTING_KEY)}`, { method: "PUT", body: JSON.stringify({ value: snapshot }) })).then(() => {
      if (revision === settingsRevision)
        settingsDirty = false;
      lastAutomationSignature = "";
      document.dispatchEvent(new CustomEvent("pao:settings-saved", { detail: message }));
      queueScan();
      applyTagAutomation();
    }).catch(() => document.dispatchEvent(new CustomEvent("pao:settings-saved", { detail: "Save failed" })));
  };
  const mutateLayout = (personaId, mutator, message) => {
    const layout = structuredClone(layoutFor(personaId));
    mutator(layout);
    settings.personas[personaId] = normalizeLayout(layout, addonsFor(personaId).map((addon) => addon.id));
    saveSettings(message);
  };
  const findPersonaForEditor = (body, localInputs) => {
    const labels = localInputs.map((input) => input.value.trim()), dialogText = body.closest('[role="dialog"]')?.textContent || "";
    const candidates = personas.map((persona) => {
      const local = Array.isArray(persona.metadata?.addons) ? persona.metadata.addons : [];
      let score = local.length === labels.length ? 20 : -Math.abs(local.length - labels.length) * 5;
      labels.forEach((label, index) => {
        if ((local[index]?.label || "").trim() === label)
          score += 3;
      });
      if (persona.name && dialogText.includes(persona.name))
        score += 10;
      return { persona, score };
    }).sort((a, b) => b.score - a.score);
    return candidates[0] && candidates[0].score > 0 ? candidates[0].persona : null;
  };
  const mountEditor = (body) => {
    const localInputs = [...body.querySelectorAll('input[class*="_addonLabelInput_"]')];
    const localCards = localInputs.map((input) => input.closest('[class*="_addonCard_"]')).filter((card) => !!card);
    const globalCards = [...body.querySelectorAll('[class*="_addonCardGlobal_"]')];
    const persona = findPersonaForEditor(body, localInputs);
    if (!persona)
      return;
    const views = personaAddons(persona, globals), localViews = views.filter((addon) => !addon.global), globalViews = views.filter((addon) => addon.global);
    const pairs = [...localCards.map((card, index) => ({ card, addon: localViews[index] })), ...globalCards.map((card, index) => ({ card, addon: globalViews[index] }))].filter((pair) => !!pair.addon);
    const signature = `${persona.id}|${pairs.map((pair) => `${pair.addon.id}:${pair.addon.label}`).join("|")}`;
    const existing = editorControllers.get(body);
    if (existing) {
      if (existing.signature !== signature) {
        existing.destroy();
        editorControllers.delete(body);
      } else
        return;
    }
    const wrappers = [];
    let rendering = false;
    const controller = { signature, wrappers, render() {
      if (rendering || !body.isConnected)
        return;
      rendering = true;
      for (const wrapper of wrappers.splice(0)) {
        try {
          ctx.dom.uninject(wrapper);
        } catch {
          wrapper.remove();
        }
      }
      const layout = layoutFor(persona.id), byId = new Map(pairs.map((pair) => [pair.addon.id, pair]));
      for (const { card } of pairs)
        card.classList.remove("pao-collapsed-item");
      const top = ctx.dom.inject(body, '<section class="pao-editor-tools"><div class="pao-editor-title">Add-on groups</div><div class="pao-help">Create and order groups here.</div><div class="pao-add-group"><input class="pao-input" placeholder="New group name"><button class="pao-btn pao-btn-primary" type="button">Add group</button></div><div class="pao-bind-section"><div class="pao-bind-title">Add-on tag auto-bind rules</div><div class="pao-help">Each binding is independent. Add as many character tag → add-on pairs as you need.</div><div class="pao-bind-add"><input class="pao-input pao-bind-tag" list="pao-character-tags" placeholder="Character tag"><select class="pao-select pao-bind-addon" aria-label="Add-on"></select><button class="pao-btn pao-bind-button" type="button">Add binding</button></div><div class="pao-bind-rules"></div></div><div class="pao-status">Ready</div></section>', "afterbegin");
      top.style.order = "-2000";
      wrappers.push(top);
      const manager = make("div", "pao-category-manager");
      manager.append(make("div", "pao-editor-title", "Categories"), make("div", "pao-help", "Put groups inside categories. The chat picker shows category filters and collapsible headings."));
      const createRow = make("div", "pao-category-create"), categoryInput = make("input", "pao-input"), addCategory = make("button", "pao-btn pao-btn-primary", "Add category");
      categoryInput.placeholder = "New category name";
      categoryInput.setAttribute("aria-label", "New category name");
      addCategory.type = "button";
      const createCategory = event => {
        event.preventDefault(); event.stopPropagation();
        const name = categoryInput.value.trim();
        if (!name) { categoryInput.focus(); return; }
        mutateLayout(persona.id, draft => draft.categories.push({ id: makeId("category"), name }), "Category added");
        controller.render();
      };
      addCategory.addEventListener("click", createCategory);
      categoryInput.addEventListener("keydown", event => { if (event.key === "Enter") createCategory(event); });
      createRow.append(categoryInput, addCategory); manager.append(createRow);
      layout.categories.forEach((category, index) => {
        const row = make("div", "pao-category-row"), name = make("input", "pao-input"), up = make("button", "pao-btn pao-icon", "↑"), down = make("button", "pao-btn pao-icon", "↓"), remove = make("button", "pao-btn pao-btn-danger", "Delete");
        name.value = category.name; name.setAttribute("aria-label", "Category name");
        for (const button of [up, down, remove]) button.type = "button";
        up.setAttribute("aria-label", "Move category up"); down.setAttribute("aria-label", "Move category down");
        up.disabled = index === 0; down.disabled = index === layout.categories.length - 1;
        name.addEventListener("change", () => {
          mutateLayout(persona.id, draft => { const current = draft.categories.find(item => item.id === category.id); if (current) current.name = name.value.trim() || "Untitled category"; }, "Category renamed"); controller.render();
        });
        const reorder = direction => {
          mutateLayout(persona.id, draft => { const ids = moveItem(draft.categories.map(item => item.id), category.id, direction); draft.categories.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); }, "Category order saved"); controller.render();
        };
        up.addEventListener("click", () => reorder(-1)); down.addEventListener("click", () => reorder(1));
        remove.addEventListener("click", () => {
          ctx.ui.showConfirm({ title: "Delete category?", message: "Its groups and add-ons will be kept under Uncategorized.", variant: "danger", confirmLabel: "Delete category", cancelLabel: "Cancel" }).then(({ confirmed }) => {
            if (!confirmed) return;
            mutateLayout(persona.id, draft => { draft.categories = draft.categories.filter(item => item.id !== category.id); draft.groups.forEach(group => { if (group.categoryId === category.id) group.categoryId = ""; }); }, "Category deleted"); controller.render();
          });
        });
        row.append(name, up, down, remove); manager.append(row);
      });
      const editorTools = top.querySelector(".pao-editor-tools") || top;
      editorTools.insertBefore(manager, top.querySelector(".pao-add-group"));
      const newGroupCategory = make("select", "pao-select pao-group-category");
      newGroupCategory.setAttribute("aria-label", "New group category");
      for (const category of [{ id: "", name: "Uncategorized" }, ...layout.categories]) { const option = make("option", "", category.name); option.value = category.id; newGroupCategory.append(option); }
      top.querySelector(".pao-add-group").append(newGroupCategory);
      const groupInput = top.querySelector(".pao-add-group .pao-input"), groupButton = top.querySelector(".pao-add-group .pao-btn-primary"), status = top.querySelector(".pao-status");
      const createGroup = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        const name = groupInput.value.trim();
        if (!name) {
          status.textContent = "Enter a group name first.";
          groupInput.focus();
          return;
        }
        try {
          mutateLayout(persona.id, (draft) => draft.groups.push({ id: makeId("group"), name, addonIds: [], categoryId: newGroupCategory.value }), "Group added");
          controller.render();
        } catch (error) {
          status.textContent = error instanceof Error ? `Could not add group: ${error.message}` : "Could not add group.";
        }
      };
      groupButton.addEventListener("click", createGroup);
      groupInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter")
          createGroup(event);
      });
      const bindTag = top.querySelector(".pao-bind-tag"), bindAddon = top.querySelector(".pao-bind-addon"), bindButton = top.querySelector(".pao-bind-button"), bindRules = top.querySelector(".pao-bind-rules");
      for (const addon of views) {
        const option = make("option", "", addon.label);
        option.value = addon.id;
        bindAddon.append(option);
      }
      bindButton.disabled = views.length === 0;
      const addBinding = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        const tag = bindTag.value.trim(), addonId = bindAddon.value;
        if (!tag) {
          status.textContent = "Choose or enter a character tag first.";
          bindTag.focus();
          return;
        }
        if (!addonId) {
          status.textContent = "Choose an add-on first.";
          return;
        }
        const duplicate = (layout.tagRules[addonId] ?? []).some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase());
        if (duplicate) {
          status.textContent = "That binding already exists.";
          return;
        }
        mutateLayout(persona.id, (draft) => {
          draft.tagRules[addonId] = [...draft.tagRules[addonId] ?? [], tag];
        }, "Auto-bind added");
        controller.render();
      };
      bindButton.addEventListener("click", addBinding);
      bindTag.addEventListener("keydown", (event) => {
        if (event.key === "Enter")
          addBinding(event);
      });
      const addonById = new Map(views.map((addon) => [addon.id, addon]));
      for (const [addonId, tags] of Object.entries(layout.tagRules)) {
        for (const tag of tags) {
          const row = make("div", "pao-bind-rule"), tagName = make("span", "pao-bind-value", tag), arrow = make("span", "pao-bind-arrow", "→"), addonName = make("span", "pao-bind-value", addonById.get(addonId)?.label || "Missing add-on"), removeBinding = make("button", "pao-btn pao-btn-danger", "Remove");
          removeBinding.type = "button";
          removeBinding.addEventListener("click", () => {
            mutateLayout(persona.id, (draft) => {
              draft.tagRules[addonId] = (draft.tagRules[addonId] ?? []).filter((item) => item !== tag);
              if (!draft.tagRules[addonId]?.length)
                delete draft.tagRules[addonId];
            }, "Auto-bind removed");
            controller.render();
          });
          row.append(tagName, arrow, addonName, removeBinding);
          bindRules.append(row);
        }
      }
      document.addEventListener("pao:settings-saved", (event) => {
        const target = top.querySelector(".pao-status");
        if (target)
          target.textContent = event.detail;
      }, { once: true });
      for (const child of [...body.children]) {
        if (child === top || child.dataset.spindleExt)
          continue;
        if (child.matches('[class*="_sectionHeader_"],[class*="_sectionHint_"],[class*="_sectionDivider_"],[class*="_emptySection_"]'))
          child.classList.add("pao-native-section-hidden");
        if (child.matches('[class*="_sectionAddRow_"]'))
          child.style.order = "9000";
      }
      const sections = [...layout.groups.map((group) => ({ id: group.id, collapseKey: group.id, name: group.name, ids: group.addonIds, categoryId: group.categoryId })), { id: "", collapseKey: UNGROUPED_KEY, name: "Ungrouped", ids: layout.ungroupedOrder }];
      sections.forEach((section, sectionIndex) => {
        const collapsed = layout.collapsedGroupIds.includes(section.collapseKey), heading = ctx.dom.inject(body, '<div class="pao-group-heading"><button class="pao-btn pao-icon pao-collapse" type="button" aria-label="Toggle group"></button><input class="pao-input" aria-label="Group name"><span class="pao-group-heading-actions"><button class="pao-btn pao-icon pao-up" type="button">↑</button><button class="pao-btn pao-icon pao-down" type="button">↓</button><button class="pao-btn pao-btn-danger pao-delete" type="button">Delete</button></span></div>', "beforeend");
        heading.style.order = String(-1500 + sectionIndex * 100);
        wrappers.push(heading);
        const collapse = heading.querySelector(".pao-collapse"), nameInput = heading.querySelector(".pao-input"), up = heading.querySelector(".pao-up"), down = heading.querySelector(".pao-down"), remove = heading.querySelector(".pao-delete");
        collapse.textContent = collapsed ? "▸" : "▾";
        collapse.title = collapsed ? `Open ${section.name}` : `Close ${section.name}`;
        collapse.setAttribute("aria-expanded", String(!collapsed));
        collapse.addEventListener("click", () => {
          mutateLayout(persona.id, (draft) => {
            draft.collapsedGroupIds = collapsed ? draft.collapsedGroupIds.filter((id) => id !== section.collapseKey) : [...draft.collapsedGroupIds, section.collapseKey];
          }, collapsed ? "Group opened" : "Group closed");
          controller.render();
        });
        if (section.id && layout.categories.length) {
          const selectCategory = make("select", "pao-select pao-group-category");
          selectCategory.setAttribute("aria-label", "Category for " + section.name);
          for (const category of [{ id: "", name: "Uncategorized" }, ...layout.categories]) { const option = make("option", "", category.name); option.value = category.id; selectCategory.append(option); }
          selectCategory.value = section.categoryId || "";
          selectCategory.addEventListener("change", () => { mutateLayout(persona.id, draft => { const group = draft.groups.find(item => item.id === section.id); if (group) group.categoryId = selectCategory.value; }, "Group category saved"); controller.render(); });
          const groupHeading = heading.querySelector(".pao-group-heading") || heading;
          groupHeading.insertBefore(selectCategory, heading.querySelector(".pao-group-heading-actions"));
        }
        nameInput.value = section.name;
        nameInput.disabled = !section.id;
        up.disabled = !section.id || sectionIndex === 0;
        down.disabled = !section.id || sectionIndex === layout.groups.length - 1;
        remove.hidden = !section.id;
        nameInput.addEventListener("change", () => {
          if (!section.id)
            return;
          mutateLayout(persona.id, (draft) => {
            const group = draft.groups.find((item) => item.id === section.id);
            if (group)
              group.name = nameInput.value.trim() || "Untitled group";
          }, "Group renamed");
          controller.render();
        });
        up.addEventListener("click", () => {
          mutateLayout(persona.id, (draft) => {
            const index = draft.groups.findIndex((group) => group.id === section.id), [group] = draft.groups.splice(index, 1);
            if (group)
              draft.groups.splice(index - 1, 0, group);
          }, "Group order saved");
          controller.render();
        });
        down.addEventListener("click", () => {
          mutateLayout(persona.id, (draft) => {
            const index = draft.groups.findIndex((group) => group.id === section.id), [group] = draft.groups.splice(index, 1);
            if (group)
              draft.groups.splice(index + 1, 0, group);
          }, "Group order saved");
          controller.render();
        });
        remove.addEventListener("click", () => {
          ctx.ui.showConfirm({ title: `Delete ${section.name}?`, message: "Its add-ons will move to Ungrouped and keep their trigger tags.", variant: "danger", confirmLabel: "Delete group", cancelLabel: "Cancel" }).then(({ confirmed }) => {
            if (!confirmed)
              return;
            mutateLayout(persona.id, (draft) => {
              const group = draft.groups.find((item) => item.id === section.id);
              draft.ungroupedOrder.push(...group?.addonIds ?? []);
              draft.groups = draft.groups.filter((item) => item.id !== section.id);
            }, "Group deleted");
            controller.render();
          });
        });
        section.ids.forEach((id, addonIndex) => {
          const pair = byId.get(id);
          if (!pair)
            return;
          pair.card.style.order = String(-1490 + sectionIndex * 100 + addonIndex);
          pair.card.classList.toggle("pao-collapsed-item", collapsed);
          const controls = ctx.dom.inject(pair.card, '<div class="pao-card-controls"><div class="pao-card-row"><select class="pao-select pao-group-select" aria-label="Add-on group"></select><span class="pao-order"><button class="pao-btn pao-icon pao-up" type="button">↑</button><button class="pao-btn pao-icon pao-down" type="button">↓</button></span></div><div class="pao-rule-label">Activate for any of these character tags:</div><div class="pao-chips"></div><div class="pao-tag-add"><input class="pao-input" list="pao-character-tags" placeholder="Add another trigger tag"><button class="pao-btn" type="button">Add</button></div></div>', "beforeend");
          wrappers.push(controls);
          const select = controls.querySelector(".pao-group-select"), none = make("option", "", "Ungrouped");
          none.value = "";
          select.append(none);
          for (const group of layout.groups) {
            const option = make("option", "", group.name);
            option.value = group.id;
            select.append(option);
          }
          select.value = section.id;
          select.addEventListener("change", () => {
            mutateLayout(persona.id, (draft) => {
              draft.groups.forEach((group) => {
                group.addonIds = group.addonIds.filter((item) => item !== id);
              });
              draft.ungroupedOrder = draft.ungroupedOrder.filter((item) => item !== id);
              if (select.value)
                draft.groups.find((group) => group.id === select.value)?.addonIds.push(id);
              else
                draft.ungroupedOrder.push(id);
            }, "Add-on moved");
            controller.render();
          });
          const itemUp = controls.querySelector(".pao-up"), itemDown = controls.querySelector(".pao-down");
          itemUp.disabled = addonIndex === 0;
          itemDown.disabled = addonIndex === section.ids.length - 1;
          itemUp.addEventListener("click", () => {
            mutateLayout(persona.id, (draft) => {
              if (section.id)
                draft.groups.find((group) => group.id === section.id).addonIds = moveItem(section.ids, id, -1);
              else
                draft.ungroupedOrder = moveItem(section.ids, id, -1);
            }, "Add-on order saved");
            controller.render();
          });
          itemDown.addEventListener("click", () => {
            mutateLayout(persona.id, (draft) => {
              if (section.id)
                draft.groups.find((group) => group.id === section.id).addonIds = moveItem(section.ids, id, 1);
              else
                draft.ungroupedOrder = moveItem(section.ids, id, 1);
            }, "Add-on order saved");
            controller.render();
          });
          const chips = controls.querySelector(".pao-chips");
          for (const tag of layout.tagRules[id] ?? []) {
            const chip = make("span", "pao-chip", tag), x = make("button", "", "×");
            x.type = "button";
            x.addEventListener("click", () => {
              mutateLayout(persona.id, (draft) => {
                draft.tagRules[id] = (draft.tagRules[id] ?? []).filter((item) => item !== tag);
                if (!draft.tagRules[id]?.length)
                  delete draft.tagRules[id];
              }, "Trigger removed");
              controller.render();
            });
            chip.append(x);
            chips.append(chip);
          }
          const tagInput = controls.querySelector(".pao-tag-add .pao-input"), addTag = controls.querySelector(".pao-tag-add .pao-btn");
          const submitTag = () => {
            const value = tagInput.value.trim();
            if (!value)
              return;
            mutateLayout(persona.id, (draft) => {
              const current = draft.tagRules[id] ?? [];
              if (!current.some((tag) => tag.toLocaleLowerCase() === value.toLocaleLowerCase()))
                draft.tagRules[id] = [...current, value];
            }, "Trigger added");
            controller.render();
          };
          addTag.addEventListener("click", submitTag);
          tagInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitTag();
            }
          });
        });
      });
      rendering = false;
    }, destroy() {
      for (const wrapper of wrappers.splice(0)) {
        try {
          ctx.dom.uninject(wrapper);
        } catch {
          wrapper.remove();
        }
      }
      for (const { card } of pairs) {
        card.style.removeProperty("order");
        card.classList.remove("pao-collapsed-item");
      }
      for (const child of [...body.children]) {
        child.classList.remove("pao-native-section-hidden");
        child.style.removeProperty("order");
      }
    } };
    editorControllers.set(body, controller);
    controller.render();
  };
  const mountProfileBindings = (section) => {
    const editor = section.closest('[class*="_editor_"]'), mount = editor?.querySelector('[data-spindle-mount="persona_editor_tab"][data-spindle-scope^="persona-editor:"]'), personaId = mount?.dataset.spindleScope?.split(":")[1] || "", persona = personas.find((item) => item.id === personaId);
    if (!persona)
      return;
    const views = personaAddons(persona, globals), layout = layoutFor(personaId), activeCharacterId = ctx.getActiveChat().characterId, signature = `${personaId}|${activeCharacterId || ""}|${characters.map((character) => `${character.id}:${character.name || ""}`).join("|")}|${JSON.stringify(characterPersonaBindings)}|${views.map((addon) => `${addon.id}:${addon.label}`).join("|")}|${JSON.stringify(layout.tagRules)}`, existing = profileControllers.get(section);
    if (existing) {
      const duplicateBindingRow = !!editor?.querySelector('[class*="_bindingRow_"]') && existing.wrappers.some((wrapper) => !!wrapper.querySelector(".pao-character-bind-row"));
      if (existing.signature !== signature || !existing.wrappers.some((wrapper) => wrapper.isConnected) || duplicateBindingRow) {
        existing.destroy();
        profileControllers.delete(section);
      } else
        return;
    }
    const wrappers = [];
    const controller = { signature, wrappers, render() {
      for (const wrapper of wrappers.splice(0)) {
        try {
          ctx.dom.uninject(wrapper);
        } catch {
          wrapper.remove();
        }
      }
      const currentLayout = layoutFor(personaId);
      if (editor && !editor.querySelector('[class*="_bindingRow_"]')) {
        const binding = ctx.dom.inject(section, '<div class="pao-character-bind-row"><button class="pao-btn pao-character-bind-button" type="button" title="Bind persona to character">\uD83D\uDD17</button><select class="pao-select pao-character-select" aria-label="Character to bind"><option value="">Choose character…</option></select><span class="pao-character-bind-label"></span></div>', "beforebegin");
        wrappers.push(binding);
        const bindButton = binding.querySelector(".pao-character-bind-button"), characterSelect = binding.querySelector(".pao-character-select"), bindLabel = binding.querySelector(".pao-character-bind-label");
        for (const character of characters) {
          const option = make("option", "", character.name || "Untitled character");
          option.value = character.id;
          characterSelect.append(option);
        }
        characterSelect.value = activeCharacterId && characters.some((character) => character.id === activeCharacterId) ? activeCharacterId : "";
        const updateBindingState = () => {
          const characterId = characterSelect.value, raw = characterId ? characterPersonaBindings[characterId] : undefined, boundId = typeof raw === "string" ? raw : raw?.personaId, isBound = boundId === personaId, name = characters.find((character) => character.id === characterId)?.name || "character";
          bindButton.classList.toggle("pao-bound", isBound);
          bindLabel.classList.toggle("pao-bound", isBound);
          bindLabel.textContent = characterId ? isBound ? `Bound to ${name}` : `Bind to ${name}` : "Choose a character";
          bindButton.title = characterId ? isBound ? `Unbind this persona from ${name}` : `Bind this persona to ${name}` : "Choose a character first";
        };
        characterSelect.addEventListener("change", updateBindingState);
        updateBindingState();
        bindButton.addEventListener("click", () => {
          const characterId = characterSelect.value;
          if (!characterId) {
            bindLabel.textContent = "Choose a character first";
            characterSelect.focus();
            return;
          }
          const raw = characterPersonaBindings[characterId], boundId = typeof raw === "string" ? raw : raw?.personaId, isBound = boundId === personaId, next = { ...characterPersonaBindings };
          if (isBound)
            delete next[characterId];
          else {
            const addonStates = Object.fromEntries(views.map((addon) => [addon.id, addon.enabled]));
            next[characterId] = Object.keys(addonStates).length ? { personaId, addonStates } : personaId;
          }
          characterPersonaBindings = next;
          fetchJson("/api/v1/settings/characterPersonaBindings", { method: "PUT", body: JSON.stringify({ value: next }) }).catch(() => {});
          controller.signature = "";
          controller.render();
          queueScan();
        });
      }
      const panel = ctx.dom.inject(section, '<div class="pao-profile-bind"><div class="pao-bind-title">Add-on auto-bindings</div><div class="pao-help">Create multiple independent character tag → persona add-on bindings.</div><div class="pao-bind-add"><input class="pao-input pao-bind-tag" list="pao-character-tags" placeholder="Character tag"><select class="pao-select pao-bind-addon" aria-label="Persona add-on"></select><button class="pao-btn pao-btn-primary pao-bind-button" type="button">Add binding</button></div><div class="pao-bind-rules"></div><div class="pao-status">Ready</div></div>', "beforeend");
      wrappers.push(panel);
      const tagInput = panel.querySelector(".pao-bind-tag"), addonSelect = panel.querySelector(".pao-bind-addon"), addButton = panel.querySelector(".pao-bind-button"), rules = panel.querySelector(".pao-bind-rules"), status = panel.querySelector(".pao-status");
      for (const addon of views) {
        const option = make("option", "", addon.label);
        option.value = addon.id;
        addonSelect.append(option);
      }
      addButton.disabled = views.length === 0;
      if (!views.length)
        status.textContent = "Create or attach a persona add-on first.";
      const addBinding = (event) => {
        event?.preventDefault();
        event?.stopPropagation();
        const tag = tagInput.value.trim(), addonId = addonSelect.value;
        if (!tag) {
          status.textContent = "Choose or enter a character tag first.";
          tagInput.focus();
          return;
        }
        if (!addonId) {
          status.textContent = "Choose an add-on first.";
          return;
        }
        if ((currentLayout.tagRules[addonId] ?? []).some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
          status.textContent = "That binding already exists.";
          return;
        }
        mutateLayout(personaId, (draft) => {
          draft.tagRules[addonId] = [...draft.tagRules[addonId] ?? [], tag];
        }, "Auto-bind added");
        controller.render();
      };
      addButton.addEventListener("click", addBinding);
      tagInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter")
          addBinding(event);
      });
      const addonById = new Map(views.map((addon) => [addon.id, addon]));
      for (const [addonId, tags] of Object.entries(currentLayout.tagRules)) {
        for (const tag of tags) {
          const row = make("div", "pao-bind-rule"), tagName = make("span", "pao-bind-value", tag), arrow = make("span", "pao-bind-arrow", "→"), addonName = make("span", "pao-bind-value", addonById.get(addonId)?.label || "Missing add-on"), remove = make("button", "pao-btn pao-btn-danger", "Remove");
          remove.type = "button";
          remove.addEventListener("click", () => {
            mutateLayout(personaId, (draft) => {
              draft.tagRules[addonId] = (draft.tagRules[addonId] ?? []).filter((item) => item !== tag);
              if (!draft.tagRules[addonId]?.length)
                delete draft.tagRules[addonId];
            }, "Auto-bind removed");
            controller.render();
          });
          row.append(tagName, arrow, addonName, remove);
          rules.append(row);
        }
      }
      document.addEventListener("pao:settings-saved", (event) => {
        const target = panel.querySelector(".pao-status");
        if (target)
          target.textContent = event.detail;
      }, { once: true });
    }, destroy() {
      for (const wrapper of wrappers.splice(0)) {
        try {
          ctx.dom.uninject(wrapper);
        } catch {
          wrapper.remove();
        }
      }
    } };
    profileControllers.set(section, controller);
    controller.render();
  };
  const mountChatPopover = (popover) => {
    const buttons = [...popover.querySelectorAll(':scope > button[class*="_popRowBtn_"]')], labels = buttons.map(addonLabelFromChatButton).filter(Boolean);
    if (!labels.length)
      return;
    const scored = personas.map((persona) => {
      const views = personaAddons(persona, globals), names = new Set(views.map((addon) => addon.label)), matches = labels.filter((label) => names.has(label)).length;
      return { persona, views, matches, score: matches * 100 + (persona.id === activePersonaId ? 1 : 0) };
    }).sort((a, b) => b.score - a.score)[0];
    if (!scored || scored.matches === 0)
      return;
    const layout = normalizeLayout(settings.personas[scored.persona.id], scored.views.map((addon) => addon.id)), labelQueues = new Map;
    for (const addon of scored.views)
      labelQueues.set(addon.label, [...labelQueues.get(addon.label) ?? [], addon]);
    const pairs = buttons.map((button) => ({ button, addon: labelQueues.get(addonLabelFromChatButton(button))?.shift() })).filter((pair) => !!pair.addon);
    const signature = `${scored.persona.id}|${pairs.map((pair) => pair.addon.id).join("|")}|${JSON.stringify(layout.groups)}|${JSON.stringify(layout.categories)}|${layout.collapsedCategoryIds.join(",")}|${layout.ungroupedOrder.join(",")}|${layout.collapsedGroupIds.join(",")}`, existing = chatControllers.get(popover);
    if (existing) {
      if (existing.signature !== signature) {
        existing.destroy();
        chatControllers.delete(popover);
      } else
        return;
    }
    const wrappers = [];
    const controller = { signature, wrappers, render() {
      for (const wrapper of wrappers.splice(0)) {
        try {
          ctx.dom.uninject(wrapper);
        } catch {
          wrapper.remove();
        }
      }
      const currentLayout = layoutFor(scored.persona.id), byId = new Map(pairs.map((pair) => [pair.addon.id, pair.button]));
      for (const { button } of pairs)
        button.classList.remove("pao-collapsed-item");
      popover.querySelectorAll(':scope > [class*="_popDivider_"],:scope > [class*="_quickSetName_"]').forEach((element) => element.classList.add("pao-native-section-hidden"));
      const categories = categorySections(currentLayout);
      let selected = chatCategoryFilters.get(scored.persona.id) || "";
      if (selected && !categories.some(category => category.id === selected)) selected = "";
      chatCategoryFilters.set(scored.persona.id, selected);
      const countFor = category => category.groups.reduce((count, group) => count + group.addonIds.filter(id => byId.has(id)).length, 0);
      for (const { button } of pairs) {
        button.classList.add("pao-category-hidden");
        button.classList.toggle("pao-chat-addon-nested", currentLayout.categories.length > 0);
      }
      if (currentLayout.categories.length) {
        const filtersHost = ctx.dom.inject(popover, '<div class="pao-category-filters" role="group" aria-label="Filter add-ons by category"></div>', "beforeend");
        const filters = filtersHost.querySelector(".pao-category-filters") || filtersHost;
        filtersHost.style.order = "1";
        filtersHost.style.position = "sticky"; filtersHost.style.top = "0"; filtersHost.style.zIndex = "2";
        wrappers.push(filtersHost);
        for (const category of [{ id: "", name: "All" }, ...categories]) {
          const count = category.id ? countFor(category) : pairs.length;
          if (category.id === "__uncategorized__" && !count) continue;
          const chip = make("button", "pao-category-chip", category.name + " (" + count + ")");
          chip.type = "button"; chip.setAttribute("aria-pressed", String(selected === category.id));
          chip.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); chatCategoryFilters.set(scored.persona.id, category.id); controller.render(); });
          filters.append(chip);
        }
      }
      let order = 100;
      for (const category of categories) {
        if (selected && selected !== category.id) continue;
        const groups = category.groups.map(group => ({ ...group, ids: group.addonIds.filter(id => byId.has(id)) })).filter(group => group.ids.length);
        if (!groups.length) continue;
        const categoryCollapsed = currentLayout.categories.length > 0 && currentLayout.collapsedCategoryIds.includes(category.id);
        if (currentLayout.categories.length) {
          const wrapper = ctx.dom.inject(popover, '<div class="pao-category-heading"><button class="pao-chat-category" type="button"><span class="pao-category-dot"></span><span class="pao-category-arrow"></span><span class="pao-category-name"></span><span class="pao-category-count"></span></button></div>', "beforeend");
          wrapper.style.order = String(order++); wrappers.push(wrapper);
          const button = wrapper.querySelector("button"); button.style.width = "100%";
          button.querySelector(".pao-category-arrow").textContent = categoryCollapsed ? "▸" : "▾";
          button.querySelector(".pao-category-name").textContent = category.name;
          button.querySelector(".pao-category-count").textContent = String(countFor(category));
          button.setAttribute("aria-expanded", String(!categoryCollapsed));
          button.addEventListener("click", event => {
            event.preventDefault(); event.stopPropagation();
            mutateLayout(scored.persona.id, draft => { draft.collapsedCategoryIds = categoryCollapsed ? draft.collapsedCategoryIds.filter(id => id !== category.id) : [...draft.collapsedCategoryIds, category.id]; }, categoryCollapsed ? "Category opened" : "Category closed"); controller.render();
          });
        }
        for (const group of groups) {
          const collapsed = currentLayout.collapsedGroupIds.includes(group.id);
          const heading = ctx.dom.inject(popover, '<div class="pao-group-wrapper"><button class="pao-chat-group" type="button"><span class="pao-chat-arrow"></span><span class="pao-chat-name"></span></button></div>', "beforeend");
          heading.style.order = String(order++); wrappers.push(heading);
          heading.classList.toggle("pao-category-hidden", categoryCollapsed);
          const button = heading.querySelector("button");
          button.classList.toggle("pao-nested-group", currentLayout.categories.length > 0);
          button.querySelector(".pao-chat-arrow").textContent = collapsed ? "▸" : "▾";
          button.querySelector(".pao-chat-name").textContent = group.name;
          button.setAttribute("aria-expanded", String(!collapsed));
          button.addEventListener("click", event => {
            event.preventDefault(); event.stopPropagation();
            mutateLayout(scored.persona.id, draft => { draft.collapsedGroupIds = collapsed ? draft.collapsedGroupIds.filter(id => id !== group.id) : [...draft.collapsedGroupIds, group.id]; }, collapsed ? "Group opened" : "Group closed"); controller.render();
          });
          for (const id of group.ids) {
            const row = byId.get(id); row.style.order = String(order++);
            row.classList.remove("pao-category-hidden");
            row.classList.toggle("pao-collapsed-item", categoryCollapsed || collapsed);
          }
        }
      }
    }, destroy() {
      for (const wrapper of wrappers.splice(0)) {
        try {
          ctx.dom.uninject(wrapper);
        } catch {
          wrapper.remove();
        }
      }
      for (const { button } of pairs) {
        button.style.removeProperty("order");
        button.classList.remove("pao-collapsed-item", "pao-category-hidden", "pao-chat-addon-nested");
      }
      popover.querySelectorAll(".pao-native-section-hidden").forEach((element) => element.classList.remove("pao-native-section-hidden"));
    } };
    chatControllers.set(popover, controller);
    controller.render();
  };
  const scan = () => {
    scanQueued = false;
    for (const [body, controller] of [...editorControllers])
      if (!body.isConnected) {
        controller.destroy();
        editorControllers.delete(body);
      }
    for (const [popover, controller] of [...chatControllers])
      if (!popover.isConnected) {
        controller.destroy();
        chatControllers.delete(popover);
      }
    for (const [section, controller] of [...profileControllers])
      if (!section.isConnected || !controller.wrappers.some((wrapper) => wrapper.isConnected)) {
        controller.destroy();
        profileControllers.delete(section);
      }
    let list = document.getElementById("pao-character-tags");
    if (!list) {
      list = make("datalist");
      list.id = "pao-character-tags";
      document.body.append(list);
      disposers.push(() => list?.remove());
    }
    const tagSignature = characterTags.map((item) => `${item.tag}:${item.count}`).join("|");
    if (list.dataset.signature !== tagSignature) {
      list.replaceChildren();
      for (const item of characterTags) {
        const option = make("option");
        option.value = item.tag;
        option.label = `${item.count} character${item.count === 1 ? "" : "s"}`;
        list.append(option);
      }
      list.dataset.signature = tagSignature;
    }
    const editorAnchors = [...document.querySelectorAll('input[class*="_addonLabelInput_"],button[class*="_sectionAddBtn_"]')], bodies = new Set(editorAnchors.map((anchor) => anchor.closest('[class*="_body_"]')).filter((body) => !!body));
    for (const body of bodies)
      mountEditor(body);
    for (const section of document.querySelectorAll('div[class*="_tagBindingSection_"]'))
      mountProfileBindings(section);
    for (const header of document.querySelectorAll('div[class*="_addonPopoverHeader_"]'))
      if (header.parentElement)
        mountChatPopover(header.parentElement);
  };
  const queueScan = () => {
    if (!scanQueued) {
      scanQueued = true;
      requestAnimationFrame(scan);
    }
  };
  async function resolveChatContext() {
    const chatId = currentChatId();
    if (!chatId)
      return null;
    const chat = await fetchJson(`/api/v1/chats/${chatId}?messages=false`);
    let personaId = typeof chat.metadata?.active_persona_id === "string" ? chat.metadata.active_persona_id : "";
    if (!personaId) {
      try {
        personaId = String((await fetchJson("/api/v1/settings/activePersonaId")).value || "");
      } catch {
        return null;
      }
    }
    let persona = personas.find((item) => item.id === personaId);
    if (!persona)
      persona = await fetchJson(`/api/v1/personas/${personaId}`);
    const character = chat.character_id ? await fetchJson(`/api/v1/characters/${chat.character_id}`).catch(() => null) : null;
    return { chat, persona, character, addons: personaAddons(persona, globals) };
  }
  async function applyTagAutomation() {
    if (automationBusy || destroyed)
      return;
    automationBusy = true;
    try {
      const context = await resolveChatContext();
      if (!context?.character)
        return;
      const states = resolveTagRuleStates(normalizeLayout(settings.personas[context.persona.id], context.addons.map((addon) => addon.id)), context.character.tags || []);
      if (!Object.keys(states).length)
        return;
      const signature = `${context.chat.id}|${context.persona.id}|${JSON.stringify(context.character.tags)}|${JSON.stringify(states)}`;
      if (signature === lastAutomationSignature)
        return;
      let chat = context.chat;
      for (const [addonId, enabled] of Object.entries(states)) {
        if (chat.metadata?.persona_addon_states?.[context.persona.id]?.[addonId] === enabled)
          continue;
        chat = await fetchJson(`/api/v1/chats/${chat.id}/persona-addons/${context.persona.id}/${addonId}`, { method: "PUT", body: JSON.stringify({ enabled }) });
      }
      lastAutomationSignature = signature;
    } finally {
      automationBusy = false;
    }
  }
  const refreshData = async () => {
    const refresh = ++refreshRevision;
    const revision = settingsRevision;
    const mayReplaceSettings = !settingsDirty;
    const nextPersonas = await listAll("/api/v1/personas");
    const [globalResult, charactersResult, tagResult, settingResult, activePersonaResult, characterBindingsResult] = await Promise.allSettled([listAll("/api/v1/global-addons"), listAll("/api/v1/characters"), fetchJson("/api/v1/characters/tags"), fetchJson(`/api/v1/settings/${encodeURIComponent(SETTING_KEY)}`), fetchJson("/api/v1/settings/activePersonaId"), fetchJson("/api/v1/settings/characterPersonaBindings")]);
    // A slow earlier refresh must never replace a newer refresh or local edit.
    if (destroyed || refresh !== refreshRevision)
      return;
    personas = nextPersonas;
    if (globalResult.status === "fulfilled")
      globals = globalResult.value;
    if (charactersResult.status === "fulfilled")
      characters = charactersResult.value;
    if (tagResult.status === "fulfilled")
      characterTags = Array.isArray(tagResult.value) ? tagResult.value : tagResult.value?.data ?? [];
    if (mayReplaceSettings && !settingsDirty && revision === settingsRevision && settingResult.status === "fulfilled")
      settings = normalizeSettings(settingResult.value.value);
    activePersonaId = activePersonaResult.status === "fulfilled" && typeof activePersonaResult.value.value === "string" ? activePersonaResult.value.value : "";
    characterPersonaBindings = characterBindingsResult.status === "fulfilled" && characterBindingsResult.value.value && typeof characterBindingsResult.value.value === "object" ? characterBindingsResult.value.value : {};
    queueScan();
    applyTagAutomation();
  };
  const observer = new MutationObserver(queueScan);
  observer.observe(document.body, { childList: true, subtree: true });
  disposers.push(() => observer.disconnect());
  refreshData().catch(() => queueScan());
  const interval = window.setInterval(() => {
    applyTagAutomation();
  }, 2500);
  disposers.push(() => window.clearInterval(interval));
  for (const event of ["CHAT_SWITCHED", "CHARACTER_EDITED", "PERSONA_CHANGED", "SETTINGS_UPDATED"])
    disposers.push(ctx.events.on(event, () => {
      lastAutomationSignature = "";
      if (event === "PERSONA_CHANGED" || event === "CHAT_SWITCHED" || event === "SETTINGS_UPDATED")
        refreshData();
      else
        applyTagAutomation();
    }));
  return () => {
    destroyed = true;
    for (const controller of editorControllers.values())
      controller.destroy();
    for (const controller of chatControllers.values())
      controller.destroy();
    for (const controller of profileControllers.values())
      controller.destroy();
    for (const dispose of disposers.reverse()) {
      try {
        dispose();
      } catch {}
    }
  };
}
export {
  setup
};


