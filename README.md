# modern_stock_webapp

The web app of **ModernStock** (PLAIN.md 12.2), for owners and staff. It is a single-page app built with Angular 19 and PrimeNG 19 (Material preset), styled with the approved prototype design, in Khmer and English.

| | |
|---|---|
| Stack | Angular 19.2 (standalone, signals), PrimeNG 19.1.4 with the Material preset + PrimeIcons, Tailwind CSS v4 (`tw:` prefix), SCSS, ngx-translate |
| Design | The prototype in [doc/plain/UX_UI/prototype](../doc/plain/UX_UI/prototype): its tokens, shell, pages and components ([src/styles/_prototype.scss](src/styles/_prototype.scss)) |
| API | [modern_stock_api](../modern_stock_api), through the dev proxy at `/api/v1` |

## Run it

1. Start the API first, from `modern_stock_api`: `./mvnw spring-boot:test-run`. Note the port it prints.
2. Then:

```bash
npm install
API_URL=http://localhost:8082 npm start          # Git Bash;   PowerShell: $env:API_URL="http://localhost:8082"; npm start
```

Open <http://localhost:4201> and sign in with `owner@demo.com` / `Demo@1234`, or as the cashier `dara` / `Demo@1234`.

- **Port:** if the API is on 8080, you don't need `API_URL`.
- **Why a proxy:** during development, `/api` is forwarded to the API ([proxy.conf.mjs](proxy.conf.mjs)). The browser then sees a single origin, so the refresh-token cookie works without CORS.

## What is built

| Area | Screens |
|---|---|
| Account | Sign in, Create account (with the "check your email" step), Verify email, Forgot password, Reset password, Invitation page (join as a new account or accept with an existing one) |
| Businesses | My businesses (with pending invitations), New business dialog, Setup page (branch, rate, riel rounding, VAT) |
| Shell | Top bar (business switcher, branch selector, today's rate, notifications, language, dark mode, account menu); side menu filtered by the member's permissions, collapsible to icons (always icons on tablets, with a flyout per group), sliding in on phones |
| Dashboard | Stock value, stock in transit, low stock, expiring batches, low-stock list, trial banner, plan usage. It reloads when the business or branch changes |
| Next | Every other menu page opens "Coming next" until it is built: POS, products, stock, documents, settings |

## How it works

- **Session:**
  - The access token lives only in memory.
  - On a browser refresh, `AuthService.init()` gets a new one from the HttpOnly refresh cookie before the first screen, behind the splash screen. The user stays signed in without any token being stored.
- **Every API call:** [api.interceptor.ts](src/app/core/auth/api.interceptor.ts) adds the token, `X-Business-Id`, `X-Branch-Id` and `Accept-Language`. On a 401 it refreshes once and repeats the call.
- **Business and branch:** both are kept per browser tab, and the last business is remembered ([business.service.ts](src/app/core/business/business.service.ts)).
- **Guards:** [guards.ts](src/app/core/auth/guards.ts) send each page to the right place:
  - not signed in → Sign in;
  - no business open → My businesses;
  - setup not finished → Setup;
  - role not allowed → Dashboard.
- **Menu:** [nav.ts](src/app/layout/nav.ts) lists every menu page with the permissions it needs. The API checks them again on every request.
- **Splash screen:** it is plain HTML and CSS in [src/index.html](src/index.html). [SplashService](src/app/core/splash.service.ts) hides it once the first page has rendered and its icon and text fonts have loaded.
- **UI components:** PrimeNG 19 with a theme preset ([modern-stock-preset.ts](src/app/core/theme/modern-stock-preset.ts)) built on the Material preset. Its colors are the prototype's CSS variables, so dark mode and the business color switch PrimeNG too. PrimeNG's styles sit in the `primeng` CSS layer, before the prototype's `components` layer ([tailwind.css](src/tailwind.css)).
- **Forms:** a field is `<p-floatlabel variant="on">` with `pInputText` (or `p-select`, `p-inputnumber`...) inside `.ms-field`, then a `.field-hint` or `.field-error` line. On submit, `revealErrors(form)` ([forms.ts](src/app/shared/forms.ts)) shows every error.
- **Icons:** PrimeIcons, written `<i class="icon pi pi-box"></i>`. The `.icon` class gives the prototype's sizes; in buttons use `<i class="pi pi-plus" pButtonIcon></i>`.
- **Tailwind:** its utilities have the `tw:` prefix (`tw:mt-4`, `tw:flex`), so they never clash with the prototype's helper classes (`.row`, `.grid`, `.mt-16`).

## Project layout

Every component has three files: `.ts`, `.html` and `.scss`.

```
src/
├── i18n/                  en.json, km.json (bundled)
├── styles/                _prototype.scss (prototype design)
├── styles.scss            PrimeIcons box, shared form, button, menu and toast styles
├── tailwind.css           Tailwind v4 with the tw: prefix
├── environments/          apiUrl, websiteUrl
└── app/
    ├── core/              api/models.ts, auth (service, interceptor, guards), business (open business and branch),
    │                      lang, theme-mode, screen (phone/tablet), notify (toasts + API error messages), splash,
    │                      theme/modern-stock-preset.ts (PrimeNG theme)
    ├── layout/            nav.ts, app-shell, app-topbar, app-sidebar, account-shell
    ├── auth/              login, sign-up, verify-email, forgot-password, reset-password, invite
    ├── account/           businesses, create-business-dialog, setup
    ├── pages/             dashboard, coming-soon
    └── shared/            auth-frame, account-menu, lang-button, flag, forms (error helpers), validators
```

## Notes

- **PrimeNG 19.1.4, no license key:** PrimeNG 19.1.4 is the last MIT release of PrimeNG 19. Later 19.x releases end in `-lts` and need a paid license key, and so does PrimeNG for Angular 22. That is why `primeng` and `@primeng/themes` are pinned to exactly `19.1.4` and the app stays on Angular 19. Don't upgrade either one to an `-lts` version.
- **Angular 19:** PrimeNG 19 supports Angular 19 only. Angular 19 runs with zone.js. It has no built-in unit-test runner like newer versions, so there is no `npm test` yet.
- **Khmer review:** Khmer text for new screens should be checked by a native speaker. Menu and account labels come from the prototype.
- **Production URLs:** for production, set `apiUrl` and `websiteUrl` in [environment.prod.ts](src/environments/environment.prod.ts). The API must allow the app's origin in `CORS_ORIGINS`.
