English | [简体中文](./README.zh-CN.md)

# Zhuji Admin (zhuji-admin)

A React admin-console framework: login and permissions, system administration, messages, approvals, help and issue feedback, a sample module and a generator for new modules. Copy it, rename the product, add your own modules, and connect your backend.

The product name shown in the UI is the placeholder **xxx Management System** (`xxx管理系统` in the Chinese UI). Replace it in `src/app.config.ts` (and in `index.html`) after copying.

## 1. Features

| Area | What is included |
| --- | --- |
| Login | Account and password with SM2-encrypted transport, slider captcha, lockout after repeated failures, forced password change for new or reset accounts, single sign-on (signed platform token, token exchange, CAS, OIDC) |
| Permissions | Roles with menu-level and button-level permission points (`can('xxx:yyy')` and `<Can>`), data scopes, terminal switches; unauthorized routes return to the home page with a notice |
| System administration | Organization tree, users and extra user attributes, roles, dictionaries, approval flows, basic settings, security policy, menus, message push, integrations, logs, backup and restore |
| Home | To-do, messages, quick links and my approvals cards; each user edits their own layout, administrators set role defaults |
| Messages and approvals | Four message levels with auto-escalation by working time, urging, group-bot push; multi-approver flows, proxy approval, auto-pass rules |
| Logs | Operation log (who, when, object, before and after, source; append-only), login log (success, failure, lockout, logout), browser error log with redaction and optional reporting |
| Security | Idle timeout, concurrent-login policy, page watermark, masked display of phone and ID numbers, sanitized Markdown, CSP suggestion, see [docs/Security.md](./docs/Security.md) |
| Look | Two themes, day (light) and night (dark), switched from the top bar or with Shift+T; an optional background glow follows day and night; an unknown saved theme value falls back to day |
| Help | User guide, issue feedback with replies, release notes, read-only database query |
| Developer experience | Sample module, `npm run new:module`, in-browser mock backend, API contract document, automated route smoke tests |

## 2. Quick start

```bash
git clone https://github.com/douguangyao-png/zhuji-admin.git
cd zhuji-admin
npm install
npm run dev          # http://localhost:3500, runs on the in-browser mock backend
```

Demo accounts (password `demo`): `admin` (system administrator), `manager` (business administrator), `head` (department head), `user`, `user2` (regular users).

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit and route smoke tests (vitest) |
| `npm run build` | Build with the mock backend (demo) |
| `VITE_API=server npm run build` | Build against a real backend; the output contains no mock code |
| `npm run check:clean` | Scan for leftover names and legacy prefixes; also checks that the two READMEs have the same number of second-level headings |
| `npm run check:api` | Compare the APIs used by pages with `docs/接口约定.md` |

## 3. Directory structure

```text
src/
  app.config.ts      product name, storage prefix, API base, backup prefix
  app/               shell: login, sidebar, top bar, idle guard, watermark, error boundary
  core/              session, permissions, menus, dialogs, import and export helpers
  api/               request entry (http.ts), types, permission catalogue, mock backend (mock/)
  ui/                shared components and style tokens
  lib/               logging, masking, sanitizing, time, password rules and other utilities
  features/
    system/          system administration pages
    help/            guide, feedback, release notes, database query, project docs
    home/            home page, approvals, messages
    example/         sample module (copy this to start a module)
docs/                API contract, development guide, security notes
scripts/             new-module.mjs, check-clean.mjs, check-api.mjs
```

## 4. Add a module

```bash
npm run new:module contract "Contracts"        # key, display name, optional two-letter document prefix
```

The script copies `features/example` into `features/<key>/` (types, API, mock backend, page, index) and registers the module in `app/modules.ts`, the module switch in `api/types.ts` and the permission points in `api/perms.ts`. It refuses to write anything if the key is invalid, reserved or already exists. Then edit the fields, validation and seed data, tick the new permission points on the roles, and run `npm run typecheck && npm test` (the route smoke test opens every menu automatically).

## 5. Connect a backend

Pages only call the backend through `src/api/http.ts`. Build with `VITE_API=server` and every request goes to `apiBase` (default `./api/v1`) using the JSON envelope, status codes, SM2 password transport and permission rules in [docs/接口约定.md](./docs/接口约定.md) (written in Chinese). `npm run check:api` fails when a page uses an API that the document does not list. Authentication relies on an HttpOnly cookie set by the backend; the front end never stores a token.

## 6. Security and responsibility

The front end can only hint: hiding a menu or button, masking a field and showing a watermark do not protect anything by themselves. **All permissions, validation, lockout, session control and data scoping must be enforced by the backend.** What the framework does, what it does not do, and what you must do when deploying (HTTPS, response headers, backend checks, compliance work) is written down in [docs/Security.md](./docs/Security.md).

## 7. Tech Stack

Versions are the ones resolved in `package-lock.json`; only what the code actually uses is listed.

| Category | Technology | Version | Used for |
| --- | --- | --- | --- |
| Framework and language | React / React DOM | 18.3.1 | UI |
| Framework and language | TypeScript | 5.6.3 | Strict typing (`tsc` runs as part of `npm run build`) |
| Build | Vite (with `@vitejs/plugin-react` 5.2.0) | 7.3.7 | Dev server and bundling; build target `chrome80`, relative base path so the output can be mounted anywhere; a CSP meta tag is added at build time |
| Routing | react-router-dom | 7.18.4 | Hash routing (`createHashRouter`), route guards |
| Data fetching and cache | TanStack Query | 5.104.3 | Server state for every page |
| Tables | TanStack Table | 8.21.3 | The shared `DataTable` component |
| State | Zustand | 4.5.7 | Session, theme, confirm dialog, toasts and other small client stores |
| Markdown and diagrams | marked | 12.0.2 | Project documents in the help menu (output goes through the sanitizer) |
| Markdown and diagrams | mermaid | 11.4.1 | Diagrams inside those documents, loaded on demand |
| QR code | qrcode-generator | 1.4.4 | QR code on printed documents |
| Password transport | SM2 / SM3 implemented in this repo (`src/lib/sm2.ts`) | not a library | Encrypts the password before it is sent; no third-party crypto library is used |
| Spreadsheets | Implemented in this repo (`src/lib/xlsx.ts`, `csv.ts`) | not a library | Reads `.xlsx` with the browser's `DecompressionStream`; CSV import and export |
| Testing | Vitest | 3.2.7 | Unit and route smoke tests |
| Testing | Testing Library (react 16.3.3, jest-dom 6.9.1, user-event 14.6.8) | see left | Rendering and interaction in tests |
| Testing | jsdom | 25.0.1 | Browser environment for tests |
| Styling | Own `tokens.css`, `ui.css`, `brand.css` | not a library | Design tokens and components; only two themes, day and night |

### What is not included

There is no backend. By default the pages run on an in-browser mock layer (`src/api/mock/`) that keeps data in the browser; connect your own backend according to [docs/接口约定.md](./docs/接口约定.md).
