# SHIC PM Suite — Unit Tests

Runs with Node's built-in test runner (Node 18+). No new dependencies.

```bash
npm run test:unit
```

## Scope

These tests lock down the **pure logic** the app depends on but that has bitten
us with silent regressions in production:

- **`_projectOverlapsRange`** (`src/js/core.js`) — period-overlap rule used by
  the dashboard filter, the shared time filter, and the reports scope. Three
  implementations used to disagree on edge cases.
- **Dropdown settings merge** — the "admin edit vs. remote push" conflict rule
  behind three consecutive dropdown-loss bugs (commits `ebd6899`, `4de3011`,
  `21367fc`).
- **`_spMergeArrays`** — the field-winner rule and deletion tracking behavior
  in the SharePoint sync path.

## Why unit tests here, not Playwright?

The E2E suite in `../specs/` exercises the app end-to-end against real
SharePoint. These unit tests target pure functions in isolation so a
merge regression fails a test in <1 second instead of surfacing 20 minutes
into an E2E run — or, worse, in production after silent data loss.

## Adding a test

Create `tests/unit/<name>.test.js` and use `node:test`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('description', () => {
  assert.equal(1 + 1, 2);
});
```
