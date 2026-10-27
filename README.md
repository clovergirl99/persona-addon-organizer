# Persona Add-on Organizer

An independent, unofficial extension compatible with Lumiverse.

## Install from GitHub

In Lumiverse, open Extensions, choose Add Extension, and paste:

https://github.com/clovergirl99/persona-addon-organizer

Install and enable the extension. Grant its requested permissions if prompted.

The checked-in frontend.js includes the current extension and persistence fixes. spindle.json points to it directly, so no build step is needed. The original 2.3.1 ZIP is retained as an archive. Use the GitHub installer or the latest versioned ZIP for the fixed version. Run npm ci and npm test to run the category UI and persistence regression tests.

---

# Persona Add-on Organizer

## 2.4.0

- Adds categories above existing groups: Category → Group → Add-on.
- Create, rename, reorder, and delete categories in the Persona Add-Ons editor.
- Assign each group using its Category selector, or choose a category when creating a group.
- Chat toolbar picker has All/category filter chips, category counts, and independently collapsible category and group headings.
- Existing groups start under Uncategorized. Deleting a category preserves its groups and add-ons.
- Keeps the 2.3.2 persistence fix. Update from GitHub and reload Lumiverse; no uninstall or settings reset is needed.

## 2.3.2

- Prevents background settings refreshes from undoing group deletion, creation, and add-on moves while saves are queued.
- Ignores responses from superseded refreshes.
- Keeps the current layout when a settings refresh fails or a save has not succeeded.
- Includes regression tests for overlapping reads and writes.

Update this extension from its GitHub repository in Lumiverse, then reload or toggle it off and on. The identifier and settings key are unchanged, so saved layouts are retained.

## 2.3.1

- Preserves Lumiverse's native **Bind to Character** row when available.
- Restores a compatible character picker and bind/unbind button when the
  native row is absent, including outside an active character chat.
- Character bindings keep a snapshot of the persona add-on states, matching
  Lumiverse's native behavior.

## 2.3.0

- Added the multi-rule add-on binding controls directly inside the native
  Persona tab's **Tag Auto-Bind** panel.
- The currently edited persona is resolved from Lumiverse's native persona
  editor scope, so the correct add-ons appear even when it is not active.

## 2.2.0

- Added a multi-rule **Add-on tag auto-bind** builder directly to the native
  Persona Add-Ons editor.
- Each character tag → add-on binding is independent, and any number of
  bindings can coexist.
- Existing per-add-on trigger controls remain available and use the same rules.

## 2.1.0

- Group headings can now be toggled open and closed in both the Persona
  Add-Ons editor and the chat typing-bar Add-Ons menu.
- The collapsed state is saved per persona and restored when reopened.

## 2.0.2

- Fixed **Add group** not responding because Lumiverse strips form elements
  from extension-injected HTML before event handlers are attached.

## 2.0.1

- Fixed the **Add group** control by using a real form submission handler.
- Added a compatible group-ID fallback for browsers without `crypto.randomUUID`.

## 2.0.0

- Removed the separate organizer drawer and separate chat action.
- Groups and management controls now live directly in the native Persona
  Add-Ons editor.
- The native Persona Add-Ons menu beside the chat input now uses the same
  group headings and add-on order.

An unofficial Lumiverse Spindle extension for organizing persona add-ons.

## Features

- Create custom groups such as **Ages**, **Personality**, or **Appearance**.
- Reorder groups and reorder add-ons inside each group.
- Move add-ons between groups without changing their content.
- Assign any number of character-tag triggers to each add-on.
- Activate every matching add-on together when a character chat opens.
- Leave add-ons without trigger tags under normal manual control.
- Open the normal **Persona Add-Ons** button beside the chat input to toggle
  add-ons using the saved group layout.
- Works with persona-specific and attached global add-ons.

The extension stores only organization and trigger rules. Existing persona
add-ons and character tags remain owned by Lumiverse.

## Install

Import the ZIP through Lumiverse's extension manager and enable it. Open a
persona's normal **Add-Ons** editor to create groups, order add-ons, and assign
trigger tags.



