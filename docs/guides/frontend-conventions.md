# Frontend Conventions

Short guidance for keeping the browser-side code consistent with the shared runtime helpers already used in `client/public/js`.

---

## Shared Helpers First

Before adding page-local formatting or transport logic, check the shared helpers in:

- `client/public/js/config.js`
- `client/public/js/utils.js`
- `client/public/js/frontend-session.js`

Prefer extending those helpers over duplicating the same behavior across page scripts.

---

## Display Formatting

Use `AppFormat` from `client/public/js/config.js` for UI-facing formatting:

- `AppFormat.date(...)`
- `AppFormat.dateTime(...)`
- `AppFormat.percent(...)`
- `AppFormat.hours(...)`
- `AppFormat.currency(...)`
- `AppFormat.currencyWhole(...)`
- `AppFormat.currencyCode(...)`
- `AppFormat.megabytes(...)`

Avoid new direct `.toFixed(...)`, `toLocaleDateString(...)`, or `toLocaleString(...)` calls in page scripts unless the formatting is genuinely one-off and does not fit the shared helpers.

If `utils.js` exposes a helper with overlapping behavior, keep it delegating to `AppFormat` rather than re-implementing formatting logic there.

---

## API and Session Access

For frontend API calls and session-aware navigation:

- Use `AppConfig.fetch(...)` or `AppConfig.fetchRoute(...)`
- Use `AppRoutes` / `AppConfig.routes.page(...)` for route building
- Use the shared session helpers instead of page-local auth token logic

Avoid page-local API URL building, direct auth header management, or reintroducing `localStorage` token handling.

---

## Scope Discipline

When touching older page scripts:

- Keep changes narrowly scoped to the behavior you are fixing
- Reuse established shared helpers before adding new page-local utilities
- Prefer small follow-up centralization changes over broad rewrites in the same patch

That keeps legacy pages moving toward shared conventions without turning bug fixes into large refactors.
