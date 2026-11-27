# NAAMII Asset Management System

A browser-based register for every asset in NAAMII's custody: assets NAAMII owns, assets bought under restricted grants where the funder holds title, and equipment received from partners. It covers registration, transfers, maintenance and damage, disposal and handover, depreciation, and Excel import/export.

It is a static web app (HTML, CSS, JavaScript). There is no server and no build step, so it runs on GitHub Pages today and can be copied to NAAMII's own server later without changes.

## The accounting rule the system applies

| Title held by | Treatment | Depreciation | Where it appears |
|---|---|---|---|
| NAAMII | Capitalised as a fixed asset | Yes, from the depreciation start date | Asset register, fixed asset schedule, ITA block working |
| Funder | Expensed to the project when bought; memo record only | No | Asset register only |
| Partner / third party | Memo record only | No | Asset register only |

Ownership is recorded per asset because it depends on each grant agreement. A project carries a default ownership and end-of-project term, and new assets under that project pick these up automatically; both can be changed per asset.

When a funder confirms that title vests in NAAMII, use **Transfer title to NAAMII** on the asset. Depreciation starts from that date on the take-on value you enter. Since the cost was already expensed to the project, the take-on value (nil, nominal or fair value) is an accounting policy decision: confirm it with your auditor.

## What each role can do

| Task | Administration | Logistics | Project Manager |
|---|---|---|---|
| View registers, schedules and dashboard | Yes | Yes | Yes (with a "My projects only" filter) |
| Register and edit assets, receive assets from partners | Yes | Yes | No |
| Record movements and physical verification | Yes | Yes | No |
| Report maintenance or damage | Yes | Yes | Yes |
| Update and close maintenance jobs | Yes | Yes | No |
| Propose disposal or handover | Yes | Yes | Yes |
| Approve or reject disposal | Yes | No | No |
| Complete an approved disposal | Yes | Yes | No |
| Transfer title to NAAMII | Yes | No | No |
| Projects, locations, categories, settings | Yes | No | No |
| Import from Excel | Yes | Yes | No |
| Export to Excel | Yes | Yes | Yes |
| Audit log, restore, clear data | Yes | No | No |

The role is chosen on entry with the user's name; there is no password in this version. Roles shape the screens and every change is written to the audit log, but this is not a security control. Real sign-in belongs to the server version.

## Disposal and handover

Five exit routes, all following the same flow: **Proposed → Approved (Administration) → Completed**.

- **Auction**, **Donation**, **Scrap**: the asset status becomes *Disposed*.
- **Handover to third party**: status becomes *Handed over* (for example, when a funder instructs NAAMII to pass equipment to another partner).
- **Return to funder**: status becomes *Returned to funder*.

If title is not with NAAMII, the funder's written approval reference is required before approval. On completion of a NAAMII-owned asset the system calculates the book value on that date and the gain or loss against proceeds. Each record has a printable disposal / handover note with signature lines.

## Where the data lives

Records are stored in the browser (IndexedDB) on the computer being used. They are **not** stored in this GitHub repository and are not shared between computers automatically.

The **Excel workbook is the shared master copy**:

1. Export the full workbook after each working session (Import / Export → Export full workbook) and save it to the shared drive.
2. A colleague imports that workbook on their computer (Import from Excel → Merge) to pick up the changes.
3. The top bar shows a reminder whenever there are changes not yet exported.

Agree on one person, or one computer, as the keeper of the master register. Two people editing separately and merging later can overwrite each other's changes to the same asset. Clearing browser data removes the records on that computer, so keep the exports and the JSON backup.

### Importing from Excel

- **Download template** gives a workbook with drop-down lists and an instructions sheet.
- Sheets recognised: Projects, Locations, Categories, Assets, Movements, Maintenance, Disposals, Settings.
- Leave Asset ID blank for new assets; keep it to update an existing asset.
- Dates: `YYYY-MM-DD`, `DD/MM/YYYY`, or a normal Excel date.
- You see a preview with every rejected row and the reason before anything is saved.

## Depreciation

**Books (straight-line).** Per asset: (depreciable value − residual value) ÷ useful life, pro-rated by day from the depreciation start date and stopped on disposal. Useful lives per category are set in Setup. The defaults shipped here are placeholders; align them with NAAMII's approved accounting policy.

**Tax working (Income Tax Act 2058, Schedule 2).** Pooled diminishing balance for Blocks A (5%), B (25%), C (20%) and D (15%); Block E on cost ÷ useful life. Additions enter the pool in full if acquired by the end of Poush, at two-thirds from Magh to Chaitra and at one-third from Baisakh to year end, with the balance added the following year. Disposal proceeds reduce the pool, proceeds above the pool are flagged as income, and a pool balance below Rs 2,000 is written off.

Points to note on the tax working:

- It is a working paper. Have it reviewed against the audited tax computation before filing.
- Enter the audited opening pool balances in Setup. Without them the pools are built only from assets registered here.
- Fiscal-year and Poush / Chaitra cut-off dates are held as AD dates in Setup (defaults: 16 July, 14 January, 13 April). The BS calendar shifts these by a day in some years, so check assets bought on the boundary days.
- The repair and improvement limit (7% of the pool) and the accelerated rates for special industries are not modelled.

## Putting it on GitHub Pages

1. Open the repository on GitHub → **Settings → Pages**.
2. Under *Build and deployment*, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and save.
3. After a minute or two the site is live at `https://lhakpa-88.github.io/naamii-assets-mgmt/`.

On a GitHub Free account, Pages works only for **public** repositories, and a Pages site is reachable by anyone who has the link. This repository holds only the program, never NAAMII's records, so making it public does not expose asset data. If you prefer to keep it private, the app can also be run by downloading the folder and opening `index.html`, or from any internal web server.

## Testing as a shared page in Claude

The same files are also published as a Claude artifact for team testing. In that mode the app uses the page's shared database instead of browser storage, so every tester sees the same records live, and Excel files are saved through the page's download prompt. Printing is not available inside the Claude viewer; use the GitHub or server copy to print notes and schedules.

SharePoint Online is not used for hosting: it does not run custom HTML/JavaScript pages from a document library unless a SharePoint Administrator allows custom script on the site, and that permission is temporary.

## Moving to NAAMII's server later

Copy the folder to any web server (IIS, Nginx, Apache, Azure Static Web Apps). For shared live data and real sign-in, replace `load()` and `save()` in `js/store.js` with calls to a database API; the rest of the app reads and writes through those two functions.

## Files

```
index.html            page shell
css/app.css           styles (NAAMII Brand Book 2026 colours)
js/config.js          fields, drop-down values, roles and permissions, defaults
js/depreciation.js    fiscal year, straight-line and ITA pool calculations
js/store.js           storage (browser, or shared database when hosted in Claude) and audit trail
js/excel.js           Excel export, template and import
js/app.js             screens, forms and workflows
js/demo.js            fictional sample data for training
vendor/exceljs.min.js Excel library (MIT licence), bundled so no internet is needed
tests/                calculation checks: node tests/depreciation.test.js
```

## Trying it out

Sign in as Administration, go to **Import / Export → Load demo data**. The sample records are fictional and can be removed with **Clear all data**.
