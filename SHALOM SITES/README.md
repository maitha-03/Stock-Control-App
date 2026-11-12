# SHALOM GENERAL STORE: Stock Control, POS, Debts & Profit System

A complete web application. It needs no installation and runs in any browser on a computer, tablet or phone.

| File | Purpose |
|---|---|
| `index.html` | The app page |
| `styles.css` | Design (green / white / dark grey) |
| `core.js` | Database layer and business rules (stock, sales, profit, debts, reversals) |
| `app.js` | All screens |
| `config.js` | **Your Firebase connection** (empty means demo mode) |
| `firestore.rules` | Security rules for the online database |
| `tests/test.html` | Automated test suite (72 checks) |

## Using it on a phone before hosting

1. Double-click / run `build-single-file.ps1` (right-click → *Run with PowerShell*). It creates **`SHALOM-STORE.html`**: the whole system in one file. A fresh copy is already included.
2. Send `SHALOM-STORE.html` to the phone (WhatsApp to yourself, USB cable, Bluetooth or email) and save it to *Downloads*.
3. On Android, open it with **Chrome** (Files app → tap the file → *Open with Chrome*). In Chrome's ⋮ menu choose **Add to Home screen** to get an app icon.
4. Each phone or computer keeps **its own records** until you host the system with the online database (below). Data entered on the phone does not appear on the computer yet.
5. Re-run the script after any change, and send the new file.

iPhone: Safari cannot run local files properly. Use the hosted link (Step 2 below).

## Theme & colours

Every user can open **Theme & Colours** in the menu to choose:
- a main colour (13 presets or any custom colour)
- the side-menu style (dark, coloured or light)
- light or dark mode
- normal or large text

The moon/sun button at the top switches light and dark mode quickly. Choices are saved on that device.

## Modes

* **Demo mode** (`config.js` left as `null`): everything works, but data is stored only in the browser that opened it.
* **Live mode** (Firebase config pasted in `config.js`): all sellers share one **online database** in real time, with secure logins. Firebase's free "Spark" plan is more than enough for a shop.

---

## Go live in about 15 minutes

### Step 1: Create the free online database (Firebase)

1. Go to **https://console.firebase.google.com** and sign in with a Google account.
2. Click **Create a project** and name it e.g. `shalom-store`. You can turn Google Analytics off.
3. In the left menu open **Build → Authentication → Get started**. Under **Sign-in method**, enable **Email/Password** and click **Save**.
   (Sellers log in with a *username*. The app turns it into an internal email automatically, so nobody needs a real email address.)
4. Open **Build → Firestore Database → Create database**. Choose a location (e.g. `africa-south1` or `europe-west1`) and **Start in production mode**.
5. In Firestore open the **Rules** tab, delete what is there, paste the **entire contents of `firestore.rules`**, then click **Publish**.
6. Click the gear icon **⚙ → Project settings → General**. Under *Your apps*, click the **Web `</>`** icon and register an app (any nickname, no hosting needed). Copy the `firebaseConfig` values.
7. Open `config.js` and replace `null` with your values:

```js
window.SHALOM_FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "shalom-store.firebaseapp.com",
  projectId: "shalom-store",
  storageBucket: "shalom-store.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

### Step 2: Put the website online (free public link)

**Netlify Drop (easiest, no tools needed)**
1. Go to **https://app.netlify.com/drop** and create a free account.
2. Drag the whole `SHALOM SITES` folder onto the page.
3. Netlify gives you a public link such as `https://shalom-store.netlify.app`. You can rename it under *Site configuration → Change site name*.
4. To update later, drag the folder again under *Deploys*.

Alternatives: GitHub Pages, Cloudflare Pages, or Firebase Hosting all work, because this is a plain static site.

### Step 3: Log in as the administrator and change the password **immediately**

There is no set-up page. The administrator account is created automatically the first time the link is opened. Its username is **`admin`** and it starts with the default password you were given.
Every device simply shows the **Log in** page. After logging in, go to **My Profile → Change password** straight away. The system reminds you until you do.

### Step 4: Add sellers

Go to **Users → Add seller / user**. Give each seller the website link, their username and their password.
Sellers can change their password and upload a profile picture under **My Profile**.

---

## Features

* **Dashboard**: products in stock, quantity available, today's sales, money collected, units sold, profit (admin), outstanding debts, low-stock alerts, recent sales and a 14-day chart.
* **Products**: auto IDs (P0001…), buying and selling price, live profit-per-unit preview, search by name or ID, category and stock filters, stock value, and LOW STOCK / OUT OF STOCK badges.
* **Units of measurement**: pcs, kg, g, ltr, ml, m, packets, bottles, bags, cartons, bales, dozens, trays, crates and more. Measured items (kg, ltr, m) can be sold in fractions, in grams / ml / cm, or by money amount ("KSh 50 worth"). The system calculates the quantity and price.
* **Bales, cartons, sacks**: set how many units are inside one pack (e.g. 1 bale = 50 pcs, 1 sack = 25 kg) and the pack price. Stock shows e.g. "147 pcs (2 bales + 47 pcs)". Sellers can sell a whole bale or loose pieces, and stock can be received in packs.
* **Team Sales**: every user sees how much each seller has sold (today / week / month / any dates), with a chart and ranking.
* **Salaries & Commission** (admin):
  * set each seller's salary (weekly or monthly) and commission (% of the profit from their own sales);
  * pay the salary, the commission or a bonus/advance with one click. Paying the same salary period twice is blocked;
  * the seller gets a pop-up message, the payment appears in their **My Earnings** page, and they tap **Confirm received**;
  * staff costs appear in the Profit report as **net profit**.
* **Stock Management** (admin): receive stock (optionally at a new buying price), remove damaged stock, stock-take counts, and a full stock-movement log.
* **New Sale (POS)**: search, a multi-product cart, automatic subtotals and total, Cash / M-Pesa / Bank / Other, amount paid, and automatic change or balance. Overselling is impossible because stock is checked inside a database transaction. A sale can never be recorded twice.
* **Customer pays less than the total**: a red section asks for the customer's **full name and phone number** (required). The sale is saved as a debt.
* **Debts tab**: every customer who owes money, with phone (tap to call), amount, age, and **who sold to them** (name + photo). Record part or full payments. Debts older than **24 hours** turn red, show a badge, and pop up an alert for the seller (and the admin).
* **Sales History**: each sale shows **PAID FULL / PART PAID / NOT PAID / OVERDUE / REVERSED**, with paid and balance columns. Filter by today, week, month, date range, status, method and seller. Open details, reprint, or download a PDF.
* **Receipts**: printable on 80 mm or 58 mm thermal paper or A4, downloadable as PDF, reprintable any time, each with a unique number (SGS-YYYYMMDD-00001).
* **Profit & Reports** (admin): revenue vs cost of goods vs gross profit, profit per product, and today / week / month / range / overall totals. Profit always uses the buying and selling prices **stored on each sale at that moment**. Print and PDF.
* **Daily Reports**: any date's transactions, units, revenue, cost and profit (admin), collections by payment method, sales per seller, and best-selling product. Print and PDF.
* **Messages**: the admin messages one seller or all sellers. A pop-up appears on the seller's screen, and **sellers can reply** from the pop-up or the Messages page. The admin sees replies as pop-ups too.
* **Users** (admin): add sellers or admins, edit, disable or enable. Each seller's sales and their customers' unpaid debts are visible.
* **Settings** (admin): shop details on receipts, currency, low-stock default, debt-alert hours, receipt paper size, categories, JSON backup, and the audit trail (reversals, deletions, user changes).
* **Security**: sellers cannot see buying prices, profit reports, users or settings. Only the admin can reverse a sale, and the reason is recorded in the audit trail. Sales cannot be deleted. All of this is enforced on the server by `firestore.rules`, not just hidden in the page.

## Notes

* **Resetting a seller's password (live mode):** the browser cannot reset another person's Firebase password. Disable the old account and create a new username, or delete the user under *Firebase console → Authentication → Users* and recreate them.
* Data survives refreshes, logouts and different devices (live mode).
* Running the tests: serve the folder with any static web server and open `/tests/test.html`. It uses demo-mode storage only.
