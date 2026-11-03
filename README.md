# modern_stock_webapp

The web app of **ModernStock** (PLAIN.md 12.2), for owners and staff. It is a single-page app built with Angular 22 and Angular Material, styled with the approved prototype design, in Khmer and English.

| | |
|---|---|
| Stack | Angular 22 (standalone, signals, zoneless), Angular Material 3 + Material Symbols icons, Tailwind CSS v4 (`tw:` prefix), SCSS, ngx-translate |
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
| Shell | Top bar (business switcher, branch selector, today's rate, notifications, language, dark mode, account menu); side menu filtered by the member's permissions, collapsible to icons, sliding in on phones |
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
- **Icons:** `<mat-icon>name</mat-icon>` draws from the Material Symbols font, and takes the prototype's `.icon` sizes.
- **Tailwind:** its utilities have the `tw:` prefix (`tw:mt-4`, `tw:flex`), so they never clash with the prototype's helper classes (`.row`, `.grid`, `.mt-16`).

## Project layout

Every component has three files: `.ts`, `.html` and `.scss`.

```
src/
├── i18n/                  en.json, km.json (bundled)
├── styles/                _prototype.scss (prototype design), _theme-colors.scss (Material palette from #1A73E8)
├── styles.scss            Material 3 theme (light and dark), shared form and menu styles
├── tailwind.css           Tailwind v4 with the tw: prefix
├── environments/          apiUrl, websiteUrl
└── app/
    ├── core/              api/models.ts, auth (service, interceptor, guards), business (open business and branch),
    │                      lang, theme-mode, notify (snack bar + API error messages), splash
    ├── layout/            nav.ts, app-shell, app-topbar, app-sidebar, account-shell
    ├── auth/              login, sign-up, verify-email, forgot-password, reset-password, invite
    ├── account/           businesses, create-business-dialog, setup
    ├── pages/             dashboard, coming-soon
    └── shared/            auth-frame, account-menu, lang-button, flag, validators
```

## Notes

- **Material, not PrimeNG:** the app uses Angular Material instead of PrimeNG. PrimeNG 22 needs a commercial license key.
- **Khmer review:** Khmer text for new screens should be checked by a native speaker. Menu and account labels come from the prototype.
- **Production URLs:** for production, set `apiUrl` and `websiteUrl` in [environment.prod.ts](src/environments/environment.prod.ts). The API must allow the app's origin in `CORS_ORIGINS`.
