English | [简体中文](./安全说明.md)

# Security notes

**The front-end framework can only hint. All permissions and validation must be enforced by the backend.** This document says what the framework does, what it does not do, and what you must do yourself when deploying. It is not a certification or a compliance conclusion and does not promise conformity with any standard.

## 1. What the framework does

| Area | Approach | Where |
| --- | --- | --- |
| Password transport | Login, password change and permanent deletion encrypt the password with the server's SM2 public key, with a one-time nonce and timestamp against replay | `src/api/sm2.ts`, rules in the API contract section 1.1 |
| Login protection | Slider captcha (always / after N failures / off); lockout for some minutes after repeated failures; the error message does not reveal whether the account exists | `src/api/mock/captcha.ts`, `core.ts` |
| Password rules | Minimum length, character classes, no spaces, must not contain the account or employee number, no reuse of recent passwords, maximum age | `src/lib/password.ts` |
| Forced change | New or reset accounts must change the password on first login; a default password can only be ignored a limited number of times | `src/app/ChangePassword.tsx` |
| Idle timeout | Auto sign-out after 30 minutes without activity by default, warning 60 seconds before, configurable, 0 disables | `src/core/idle.ts`, `src/app/IdleGuard.tsx` |
| Concurrent login | Configurable: allow several sessions or kick the old one (old session requests get 401) | security policy page, `src/api/mock/session.ts` |
| Menu and button permissions | One `can('xxx:yyy')` and `<Can perm>`; menus are trimmed by permission; opening an unauthorized route returns home with a notice | `src/core/me.ts`, `Can.tsx`, `src/app/App.tsx` |
| Data scope | Roles can be all / own department and below / own department / self / custom units, union across roles; the mock backend filters accordingly and the API contract requires the same of the backend | `src/api/mock/services.ts` |
| Double submit | Buttons are disabled while submitting; an identical write request is not sent twice while one is in flight | `src/api/http.ts` |
| Input limits | `maxLength` on inputs matches server-side validation | pages, `test/buttons.test.ts` and others |
| XSS | No `dangerouslySetInnerHTML` (icons are parsed into elements too); Markdown goes through a whitelist sanitizer that removes scripts, event attributes and `javascript:` links; external links get `rel="noopener noreferrer"` | `src/lib/sanitize.ts`, `src/ui/Icon.tsx` |
| Content Security Policy | The built `index.html` carries meta tags for CSP and Referrer-Policy | `vite.config.ts` |
| Sensitive data | Phone and ID numbers are shown masked (`<Masked>`); logs and reports are redacted (password, token, secret and ID fields are hidden entirely, numbers are masked); apart from a user id and a session number nothing credential-like is kept in the browser | `src/lib/mask.ts`, `src/ui/Masked.tsx`, `src/lib/log.ts` |
| Page watermark | After login, "account + name + time" is overlaid; it can be turned off in the security policy | `src/app/Watermark.tsx` |
| Export | Choose columns before exporting, exports are logged, export is a separate permission | `src/core/export.tsx`, `op:export` |
| Logs | Operation log (append-only), login log, restorable deletion records, redacted front-end error reports | System › Operation log |
| Attachments | Pages, scripts and executables are rejected on upload (the backend must reject them too) | API contract chapter 6 |

## 2. What the framework does not do

- It performs no backend validation. The mock backend exists for demos; its lockout, session and permission checks **are not a security mechanism**.
- It does not manage server sessions, issue or refresh tokens, hash stored passwords, or make the captcha truly unbypassable. The backend does these.
- Watermarks, masking and hidden buttons or menus **cannot stop** deliberate screenshots, photos, traffic capture or page tampering.
- It provides no HTTPS, WAF, rate limiting, brute-force defense, intrusion detection, database encryption, key management or backup encryption.
- It does no virus scanning or content review, and does not guarantee that third-party dependencies are free of vulnerabilities (run dependency audits and upgrade regularly).
- It provides no conclusion or material for classified protection, industry compliance or personal-information protection.

## 3. Tokens and sessions

- Current state: the browser stores only a user id and a session number (`localStorage`). They are **not credentials**; editing them only changes which user the UI pretends to be, while the backend still identifies the caller by cookie.
- Recommended: the backend sets the login credential in an `HttpOnly; Secure; SameSite=Lax` (or Strict) cookie that scripts cannot read, so injected JavaScript cannot steal it. Never put tokens in `localStorage`, `sessionStorage` or URLs.
- With cookies, protect writes against CSRF: check `Origin` / `Referer`, or require a custom header plus a CSRF token.
- A single sign-on token appears in the address bar once during the redirect and is removed right away with `history.replaceState` (`src/main.tsx`).

## 4. What you must do when deploying

1. **HTTPS everywhere**, with HSTS; also recommended on internal networks.
2. **Validate everything on the backend**: authentication, the permission point of every endpoint, data scope, field length and format, duplicate submission, file type and size, SQL and command injection. Whatever the front end checks, the backend must check again.
3. **Enforce on the backend** lockout, password rules, forced change, session expiry, the concurrent-login policy and captcha verification; store passwords only as salted hashes (SM3, bcrypt or argon2 recommended).
4. **Mask sensitive fields on the backend** before returning them; when full values are needed, authorize that separately instead of sending plaintext and hiding it in the UI.
5. **Logs**: persist operation and login logs on the backend, append-only, with a retention period that fits your rules; `/client-logs` must be rate-limited, size-limited and redacted again.
6. **Response headers**: configure nginx as in section 6 and confirm in the browser developer tools.
7. **Dependencies and build**: run `npm audit` regularly and upgrade; build with `VITE_API=server` and confirm the output has no mock code; do not publish `node_modules`, source maps or `.env`.
8. **Compliance**: classified protection, personal-information protection, cross-border data, cryptography requirements and the like are for you to assess and fulfil; this framework does not carry them for you.

## 5. Conventions for new modules

- Permissions: give menu items a `perm`; use `can('module:action')` or `<Can perm=…>` for buttons and fields; the backend must check the same permission point. Do not render fields the user may not see and hide them with CSS.
- Use `<Masked kind="phone|idCard">` for numbers instead of building asterisks by hand.
- Do not use `dangerouslySetInnerHTML`; run foreign HTML or Markdown through `sanitizeHtml` first.
- External links need `target="_blank" rel="noopener noreferrer"`.
- Log with `log.debug/info/warn/error` rather than `console.log` of business data; objects passed to the logger are redacted automatically, but still do not pass passwords or tokens on purpose.
- Data scope: list endpoints merge the scopes of the user's roles and filter; the front end must not filter locally to make it "look" like only your own data.

## 6. Recommended response headers (nginx)

The built page already has a meta version of the CSP; response headers cover more (notably `frame-ancestors`, which does not work in a meta tag), so prefer headers.

```nginx
server {
  listen 443 ssl http2;
  # ssl_certificate / ssl_certificate_key: your certificates

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
  # Not embeddable by other sites; replace 'none' with a site address to allow embedding
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
  add_header X-Frame-Options "DENY" always;   # fallback for old browsers, same intent as frame-ancestors

  location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
    # hashed static files may be cached for a long time; do not cache index.html
  }
  location = /index.html { add_header Cache-Control "no-store" always; }
  location /api/ { proxy_pass http://backend; }
}
```

Notes: `style-src 'unsafe-inline'` is needed because React `style` attributes and some components use inline styles; inline scripts are not allowed. When integrations such as enterprise chat need extra domains, add the specific domains to `connect-src` and `img-src` instead of widening to `*`.

## 7. Known limitations

- The idle timer runs in the browser only: closing the page or losing the network does not notify the backend, so the backend must expire sessions itself.
- The watermark is a DOM element and can be removed in developer tools; traceable screenshot protection needs backend support.
- The meta version of the CSP does not support `frame-ancestors` or `report-uri`.
- Front-end error reports are limited to 10 per minute and the same message is reported once a minute, so repeated problems may be under-reported.
