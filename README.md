# Miraloma PTA equipment

A small Next.js app where PTA volunteers and staff browse the equipment the PTA owns (tables, chairs, coolers, the popcorn machine), see what is free on which days, and ask to borrow it for an event. Each item's owner approves their part of the request, the borrower gets one email with pickup instructions, and the borrower marks things picked up and returned from their phone, leaving condition notes for the next person. The product spec is in [`specs/`](specs/).

The app keeps no data of its own. In production everything lives in the PTA's Google Workspace as equipment@miralomasf.com: one spreadsheet with a tab per kind of record, photos in a Drive folder, email through Gmail. In development the same code writes to `./.data` instead. It is built like [reimburse-me](https://github.com/MiralomaPTA/reimburse-me), and its sign-in and Google adapters started as copies of that app's.

## Run it locally

```bash
npm install
npm run seed         # sample items, people and bookings around today, in .data/sheet/
npm run dev          # http://localhost:3000
```

No Google setup is needed for development. With the default `ADAPTERS=local`:

- The spreadsheet is one JSON file per tab in `.data/sheet/` (`Items.json`, `Lines.json`, …), with the same columns as the Sheet. Edit them by hand to try what a hand-edited Sheet does.
- Sign-in emails are printed to the terminal and saved to `.data/outbox/`, with an `.html` copy of each email to open in a browser. Copy the sign-in link from there.
- Photos are saved under `.data/files/`.

The seed has people to sign in as:

| Address | Who |
| --- | --- |
| `admin@example.com` | An admin who owns nothing: decides items with no owner, approves new users |
| `dana@example.com` | Owns most items, so has requests to decide on the Review tab |
| `chris@example.com` | Owns the coolers |
| `jordan@example.com` | A borrower, with the pending Winter Carnival request from the mockups |
| `sam@example.com`, `priya@example.com` | Borrowers with bookings that are overdue, out, and coming up |

`npm run seed -- --force` resets the data. Other commands:

```bash
npm test             # unit tests (vitest): dates, availability, the Sheet layer, the request lifecycle, sign-in, import, emails
npm run typecheck
npm run lint
npm run build
```

The same four checks run in GitHub Actions on every push and pull request; see `.github/workflows/ci.yml`.

## Configuration

Copy `.env.example` to `.env.local`. Everything has a development default except `SESSION_SECRET`, which is required in production (`openssl rand -base64 48`).

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public base URL used in emailed links, e.g. `https://equipment.miralomasf.com` |
| `ADAPTERS` | `local` or `google` |
| `SESSION_SECRET` | Signs sign-in links and session cookies |
| `FROM_EMAIL`, `FROM_NAME` | Who emails come from (equipment@, "Miraloma PTA Equipment") |
| `CONTACT_EMAIL` | The address shown for questions; defaults to `FROM_EMAIL` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` | Service account credentials |
| `GOOGLE_IMPERSONATE_EMAIL` | Workspace user to act as (equipment@) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `GOOGLE_SHEET_ID` | Where data lives |
| `ALLOW_LOCAL_ADAPTERS_IN_PRODUCTION` | `1` only to try a production build on a laptop with `ADAPTERS=local` |

## Phase 0: Google Workspace setup

One-time, done by the PTA's Google Workspace super admin.

1. **Account.** Create the Workspace user **equipment@miralomasf.com**. Everything the app stores is owned by it.
2. **Google Cloud.** In the PTA's Google Cloud project (the one reimburse-me uses is fine), make sure the **Google Drive API**, **Google Sheets API** and **Gmail API** are enabled.
3. **A new service account.** IAM & Admin → Service Accounts → Create, e.g. "pta-equipment". No roles needed. Open it → Keys → Add key → JSON. Keep the file; it holds `client_email` and `private_key`. Note the numeric **Unique ID** (client ID). Don't reuse reimburse-me's service account: a separate one means a leaked key exposes one app, not both.
4. **Domain-wide delegation.** In [admin.google.com](https://admin.google.com) → Security → Access and data control → API controls → Manage domain-wide delegation → Add new. Client ID: the new service account's unique ID. Scopes, comma-separated:
   `https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/gmail.send`
5. **Drive and Sheet, as equipment@.** Create a folder "PTA equipment" in equipment@'s My Drive and note its ID (the last part of the folder URL). Create a Google Sheet "PTA equipment" (it can sit in that folder) and note its ID. Share both with the admins. The app creates every tab and header row it needs on first use, and adds any columns it gains later to the end of an existing header row.
6. **Fill in the Sheet** (after the first page load has made the tabs):
   - `Users`: one row per admin with `status` = `approved` and `role` = `admin`. Paste other people you know (board members, room parents, event chairs) with `status` = `approved` so they never wait. Everyone else asks for access from the sign-in page and every admin is emailed.
   - `Locations`: one row per place equipment is kept, with `pickup_instructions` and `return_instructions`. These go in the confirmation email and on the return form.
   - `Event types`: `PTA event`, `Signup party`, `Classroom`, `Other` (used until you add rows). Set `active` to `FALSE` to retire one.
7. **Vercel.** Create the Vercel account under equipment@miralomasf.com, import the GitHub repo, set the variables above with `ADAPTERS=google` and `APP_URL=https://equipment.miralomasf.com`, and add the domain (a CNAME for `equipment` in the miralomasf.com DNS).

The app never stores the key on disk; it reads `GOOGLE_PRIVATE_KEY` from the environment. In Vercel, paste the key with its `\n` line breaks intact.

## The first stocktake

Photograph everything, then list it in a CSV with these columns (see [`examples/items.csv`](examples/items.csv)):

| Column | |
| --- | --- |
| `name` | Required, e.g. `Folding table, 6 ft` |
| `quantity` | Required, how many the PTA has |
| `description`, `tags` | Tags separated by commas, e.g. `Tables & chairs, Outdoor` |
| `location` | A name from the Locations tab |
| `owner_email` | Who approves requests for it; blank means the admins |
| `contents` | The parts to check at return, separated by `;`, e.g. `Kettle; Scoop; Power cord` |
| `photo` | A file name in the photos folder |

```bash
npm run import-items -- items.csv photos/            # shows what it would add, with warnings
npm run import-items -- items.csv photos/ --commit   # adds it
```

It uses whatever `ADAPTERS` says, so put the Google variables in `.env.local` to load the real Sheet. Items already in the Items tab (by name) are skipped unless `--allow-duplicates`. Photos are shrunk, rotated and stripped of location data, with a thumbnail made for the catalog. Afterwards, items can be edited in the app or straight in the Items tab.

## How it works

```
src/app/                   pages, server actions and route handlers
  page.tsx                 sign-in, or the catalog once signed in
  items/[id]               item page: status, contents, bookings, condition history, problem banner
  items/new, [id]/edit     add or edit an item (admins; owners edit their own)
  calendar                 timeline of bookings: two weeks on a phone, four on a wider screen
  request                  the request being put together (a cookie) and the form to send it
  requests, requests/[id]  my requests; one request with Picked up / Returned / Cancel
  requests/[id]/return     the return form, for one item or "Return all"
  review, review/[id]      owners and admins: what to decide, what's out, problems; the decision page
  admin                    access requests, items that need attention, archived items
  photos/[id]              item and return photos, for signed-in users only
  actions/                 server actions; each re-checks the session and calls src/server/domain
src/server/
  db/                      the Sheet's tabs and columns (schema.ts), parsing, the typed Db with its short cache
  adapters/                SheetStore, FileStore and Mailer: google/, local/ (files in .data) and memory/ (tests)
  domain/                  every change: submit, decide, cancel, pick up, return, clear a problem, save an item
  email/                   emails written once as blocks, sent as plain text plus simple HTML
  auth/                    one-time email links, sessions, access requests (from reimburse-me)
src/lib/                   shared by server and browser: dates (whole Pacific days), availability rules, statuses
scripts/                   seed-local.ts, import-items.ts
```

**The Sheet as a database.** The tabs are Items, Locations, Event types, Users, Requests, Lines (one per item on a request), Activity (every change, append-only) and Sends (for the daily job). Columns are found by header name and rows by ID, so sorting, filtering and adding columns by hand are safe; renaming a header breaks it. Each page reads the six tabs it needs in one `batchGet`, shared between the layout and the page, and reuses it for 3 seconds: Sheets allows about 60 reads a minute for the one user the app acts as. Updates write only the cells that change, so formulas and formatting in other columns survive. Before changing a line the app re-reads it and checks its status is still what the page showed; if not, the person is asked to reload. Request IDs are sequential (`R-0142`); two requests sent at the same moment are given different numbers before their lines are written.

**Availability.** Dates are whole days in Pacific time. Approved and picked-up lines hold their units on every day from pickup to return; pending lines hold nothing and show as tentative; an overdue line holds its units through today. The request form works this out in the browser as the dates change, and the server checks again on submit. An owner approving more than is free is warned and must confirm.

**Photos** are converted from HEIC and shrunk to 1600 px in the browser, then sent with the form (server actions accept up to 4 MB, under Vercel's 4.5 MB limit). The server re-encodes them with sharp and stores them in Drive. They are never shared publicly; `/photos/[id]` serves them to signed-in users, and only files the app stored.

**Email** goes out as equipment@ with the From name "Miraloma PTA Equipment". Emails to a borrower about items set Reply-To to those items' owners, so a reply reaches a person. Approve and decline are never buttons in an email (link scanners would press them); emails link to the page. If an email fails to send, the change is still saved and the failure is logged.

## Not yet built

Phase 2 of the spec: the daily GitHub Actions job (pickup, return-due, overdue, stale-request and expiry reminders), copied from meeting-manager's `tick.yml`. The Sends tab and the `Expired` line status are already in the data model. Until then, a line still pending after its pickup date stays pending.
