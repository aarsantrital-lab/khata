# Khata — shop ledger

Khata is a ledger app for a VAT-registered wholesale electronics shop in Nepal, in the style of Karobar / Khatabook. It records sales, purchases, payments, expenses, stock and VAT. It runs as an installable web app (PWA) on an Android phone and on an old laptop, and works fully offline.

Official tax invoices stay in the handwritten VAT bill book. The app records each bill's number and keeps everything else: who owes what, partial payments, advances, returns, cash and bank balances, stock and reports.

## What it does

- **Two languages:** full Nepali and English modes. Digits (१२३ / 123) and calendar (BS / AD) switch independently. BS is the default.
- **Dashboard:** today's sales, लिनुपर्ने (to receive), दिनुपर्ने (to pay), cash, banks and wallets, with green or red trend arrows, and a strip with each account's own balance. Big buttons for Sale, Payment, Expense, Purchase, Reports and Bill photo. It also shows a VAT-return reminder before the 25th, bill photos still to enter, the overdue list and low stock.
- **Look and menu:** six themes (Auto, Light, Dark, Purple, Night sky and Marigold) in **Settings > Display**. On the phone, the ☰ button slides out a menu with every page; the laptop always shows it.
- **Parties:**
  - Customers and suppliers with phone, PAN, address, opening balance and credit period.
  - A running balance, green when they owe you and red when you owe them.
  - Paid / Partial / Unpaid per bill, e.g. "Partial, Rs 5,000 remaining".
  - One-tap WhatsApp, Viber or SMS reminders.
  - Search understands Nepali digits, so ९८४१ finds 9841. Phone and PAN are saved in plain digits.
  - A warning when a PAN or phone already belongs to another party. Renaming a party also renames it on old bills, and a new PAN can be put on old bills with one tick.
- **पार्टी खोज (Find party):** type a PAN, phone or name and see the balance, PAN, phone, open bills and last bill at once, with copy, call and WhatsApp buttons.
- **Bills:** sales and purchases with the handwritten bill number, BS date, PAN, items, discount, taxable or VAT-exempt lines, and a 13% VAT breakdown. Payment at the time of the bill can be full, partial or none.
  - Returns are credit or debit notes against the original bill.
  - **Repeat this bill** copies a bill's items for a new one, and a new bill offers **Repeat last bill** for the chosen party.
  - Nothing is deleted. Cancelled entries stay in history and can be restored, and every edit is recorded.
- **Bill photos:** photograph a handwritten bill when it is busy and type it in later.
  - **Take photo** or **Choose photo** (several at once). Photos are shrunk to about 1600 px, turned grey with extra contrast and saved as WebP, usually 30–300 KB.
  - A **To enter / Entered / Removed** inbox. **Enter this bill** opens a new bill with the photo beside the form (above it on the phone); saving moves the photo to Entered and links it to the bill.
  - Photos can also be added to a bill or to a party (bills, cheques, any paper). Removed photos can be restored.
- **Payments:** cash, bank, eSewa or Khalti. A payment can go to chosen bills or to the oldest bills first. Extra money is kept as advance credit and used automatically on the next bill.
- **Money:** cash, several banks, eSewa, Khalti and other wallets (IME Pay, PrabhuPAY…), each with an opening balance. **Add banks and wallets** picks common Nepali banks and wallets in one go.
  - Expenses and income by category, with business and personal kept separate.
  - Transfers between accounts (e.g. cash deposited in the bank).
  - A bank check that flags any difference from the bank's balance.
- **Stock:** brand, model, category, unit (piece or box), wholesale and cost price. Purchases and sales move stock automatically. Low-stock alerts and adjustments for damaged goods.
- **Bill copies and statements:**
  - A bill copy carries the shop logo, PAN, payment history, a PAID / PARTIAL / UNPAID stamp, an uploaded signature and the footer "This is a payment statement, not a tax invoice. Ref. Bill No. ___".
  - A party statement can cover any date range.
  - Both can be saved as an image or PDF, printed on A4 or A5, or shared to WhatsApp or Viber.
- **Reports:**
  - Day, BS month, Nepali fiscal year (Shrawan–Asar) or any date range, with trends against the previous period.
  - Profit and loss, sales by month, top debtors and expenses by category.
  - A monthly VAT summary (collected minus paid, with credit carried forward) and a "mark filed" button.
  - IRD-style sales and purchase books, exported to Excel or PDF.
- **Settings:** shop details, logo and signature, language, digits and calendar, VAT rate, and a PIN lock (no sign-up). Also backup and restore to a file, sample data, and phone and laptop sync.

Not included, by design: IRD-certified invoicing, staff accounts, and serial or warranty tracking.

## Run it locally

You need Node.js 22.12 or newer (the current LTS from [nodejs.org](https://nodejs.org) is fine).

```bash
npm install
npm run dev          # http://localhost:4317
```

The first screen asks for a language and the shop details. To look around first, tap **Try with sample data**. Remove the sample later in **Settings > Start over** before entering real data.

Other commands:

```bash
npm test             # unit tests: balances, partial payments, advances, VAT, credit notes, BS dates, sync, backup,
                     # themes, party lookup, duplicate PAN/phone, quick-add accounts, photo compression and photo sync
npm run e2e          # click-through tests on an Android phone, an iPhone (Safari's engine) and a laptop
                     # (run `npx playwright install chromium webkit` once)
npm run build        # production build in dist/
npm run preview      # serve the production build on http://localhost:4318
npm run icons        # re-render the PNG app icons from public/favicon.svg
```

## Install on the phone and laptop

Open the hosted address in Chrome. On Android, use the menu, then **Add to Home screen** or **Install app**. On the laptop, click the install icon in the address bar (Chrome or Chromium on Kali works). Khata then opens in its own window and works without internet. On an iPhone or iPad, open it in **Safari**, tap **Share**, then **Add to Home Screen**, and always open Khata from that icon; Settings shows the same steps.

## Phone and laptop sync (Supabase, optional)

Without sync, all data stays on the device. Use **Settings > Backup** to save a copy. With sync, every change is saved locally first and uploaded when there is internet. Offline changes from either device merge later.

1. Sign up at [supabase.com](https://supabase.com) (GitHub or email) and create a **New project** on the Free plan. Pick the nearest region (Mumbai for Nepal), save the database password somewhere safe, and leave the Data API turned on.
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It is safe to run again later.
3. Copy two values. The **Connect** button at the top of the project shows both, or use **Project Settings**:
   - the **Project URL**, like `https://abcd1234.supabase.co`;
   - the **publishable key** (`sb_publishable_…`) from **API Keys**. Older projects can use the legacy `anon` public key. Never use a **secret** key (`sb_secret_…` or `service_role`): the app is a public web page, so it refuses those.
4. Give the app those two values in one of two ways:
   - Build them in by setting `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see [`.env.example`](.env.example)) on the hosting service or in a local `.env` file. The key goes in `VITE_SUPABASE_ANON_KEY` even when it is a publishable key.
   - Or type them in **Settings > Phone and laptop sync** on each device.
5. On the first device, tap **Start sync on this device**. Khata checks the project first and says what to fix if the URL, the key or step 2 is wrong. A sync code appears.
6. On the second device, tap **Join with a code** and type that code.

Sync needs an `https://` address (or `localhost`). Over plain `http://` on the local network the app works, but sync and installing are switched off.

Supabase pauses Free projects after about a week with no activity. Daily use keeps it awake. If it does pause, Khata keeps working offline and catches up after you click **Restore** in the Supabase dashboard.

Bill photos sync too. A photo's details travel with the other rows, and the image is uploaded separately and downloaded on the other device the first time it is opened there. The server refuses images over about 1.5 MB, and the app's photos are far smaller. If you set up sync before bill photos existed, run `supabase/schema.sql` again.

Backups (**Settings > Backup**) include the photo images, so a restored device has them without sync.

The sync code is the shop's key. Only a SHA-256 hash of it reaches the server. The table is closed to direct access, and devices can only reach their own shop's rows through SQL functions (`khata_push` and `khata_pull` for records, `khata_photo_put` and `khata_photo_get` for photo images). When the same record is edited on both devices, the newest edit wins. Edits are never silently dropped, because every version also stays in the change history.

## Deploy

The build is a static folder (`dist/`). Hash routing and relative asset paths let the same build work from any address, including a sub-folder such as `https://you.github.io/khata/`.

### GitHub Pages

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) runs the unit tests, builds the app and publishes it on every push to `main`.

1. Push this project to a GitHub repository. On a free GitHub account, Pages needs the repository to be **public**. That is safe: the code holds no passwords, and shop data lives on the devices and in Supabase, not in the repository.
2. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**.
3. Optional, to build sync in: **Settings > Secrets and variables > Actions > New repository secret**. Add `VITE_SUPABASE_URL` (the Project URL) and `VITE_SUPABASE_ANON_KEY` (the publishable key). Skip this to type them in Settings on each device instead.
4. Open the **Actions** tab. The first run starts by itself after step 1. If it ran before step 2 and failed, open it and click **Re-run all jobs**, or use **Run workflow**. After a secret changes, run it again so the new values are built in.
5. The address appears on the finished run and in **Settings > Pages**, e.g. `https://your-name.github.io/khata/`. Open it on the phone and laptop and install it.

### Other hosts

- **GitLab Pages:** push to GitLab. [`.gitlab-ci.yml`](.gitlab-ci.yml) runs the tests and publishes Pages from the default branch. Add the two `VITE_SUPABASE_*` values under **Settings > CI/CD > Variables** if you want sync built in.
- **Vercel:** import the repository. [`vercel.json`](vercel.json) sets the build. Add the environment variables in the project settings.
- **Netlify:** import the repository. [`netlify.toml`](netlify.toml) sets the build.

## How it is built

- React 19, TypeScript, Vite, Tailwind CSS v4 and shadcn/ui (Base UI) components. The font is Mukta, which covers Devanagari and Latin.
- Data lives in IndexedDB through Dexie. Every write goes through one function that stamps the time, keeps the previous version in a history table and queues the row for sync.
- Bill photo images live in their own table, apart from the photo rows, so lists only load a tiny preview.
- Themes are CSS variables switched by a `data-theme` attribute. A small script in `index.html` applies the saved theme before the first paint.
- Money is stored as whole paisa (integers). VAT is computed with integer half-up rounding.
- BS dates use `nepali-date-converter`. Dates are stored as AD `YYYY-MM-DD` and shown in BS or AD.
- Bill copies, statements and books are rendered to an image with `html-to-image`, which keeps Nepali text correct in PDFs (`jspdf`). Excel export uses `write-excel-file`.
- The PIN lives only on the device, as a salted hash. It is not an account and needs no sign-up.

```
src/
  app/         data provider, locale hook, onboarding and PIN gate
  components/  shell, number pad, BS/AD date picker, pickers, document viewer, photo capture and viewer
  docs/        bill copy, party statement, sales and purchase books
  lib/         money, BS dates, VAT, ledger engine, storage, sync, backup, i18n, themes, search, photos
  pages/       screens
e2e/           Playwright click-through tests
supabase/      SQL for the optional sync server
.github/       GitHub Pages workflow
```
