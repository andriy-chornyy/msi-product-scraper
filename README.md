# MSI Product Scraper

A small Node.js + Playwright scraper that extracts product data from a single
MSI product page and saves it as a structured JSON file. Built as a junior
JavaScript test task.

## Features

- Runs in headless mode (no visible browser window).
- Extracts item ID, title, brand, category breadcrumbs, price/sale price,
  availability, main and additional images, description, star rating,
  review count, specs table, MPN and GTIN when available.
- Normalizes prices to numbers and missing fields to `null`.
- Saves the result to `output/product.json`.

---

## Technical Stack

- **Runtime**: Node.js (v18+)
- **Automation Framework**: Playwright (Chromium)
- **Output Storage**: Native File System (`fs`)

---

## Installation / How to run

1. Clone the repository:
```bash
git clone https://github.com/andriy-chornyy/msi-product-scraper.git
```

2. Navigate to the project folder:
```bash
cd msi-product-scraper
```

3. Install dependencies:
```bash
npm install
```

4. Install the Chromium browser binary required by Playwright:
```bash
npx playwright install chromium
```

5. Run the scraper with the default URL:
```bash
npm run scrape
```

After a successful run, `output/product.json` is created or overwritten.

---

## Usage

### Run with the default URL

Scrapes the default product page (`MAG Z890 TOMAHAWK WIFI`):
```bash
npm run scrape
```

### Run with a custom URL

Pass any other MSI product page URL as an argument (note the `--` separator,
required so npm forwards the argument to the script):
```bash
npm run scrape -- https://us-store.msi.com/Motherboards/Intel-Platform-Motherboard/INTEL-Z890/MEG-Z890-ACE
```

---

## Output

### Sample data format

```json
{
  "url": "https://us-store.msi.com/Motherboards/Intel-Platform-Motherboard/INTEL-Z890/MAG-Z890-TOMAHAWK-WIFI",
  "item_id": "2373",
  "title": "MAG Z890 TOMAHAWK WIFI",
  "brand": "MSI",
  "product_category": "Motherboards > INTEL PLATFORM > Intel Z890",
  "category_tree": [
    { "name": "Motherboards", "url": "https://us-store.msi.com/Motherboards" },
    { "name": "INTEL PLATFORM", "url": "https://us-store.msi.com/Motherboards/Intel-Platform-Motherboard" },
    { "name": "Intel Z890", "url": "https://us-store.msi.com/Motherboards/Intel-Platform-Motherboard/INTEL-Z890" },
    { "name": "MAG Z890 TOMAHAWK WIFI", "url": null }
  ],
  "description": "...",
  "price": 259.99,
  "sale_price": null,
  "availability": "in_stock",
  "image_url": "https://asset-us-store.msi.com/...png",
  "additional_image_urls": ["..."],
  "specs": [
    { "name": "Chipset", "value": "INTEL Z890 Chipset" }
  ],
  "star_rating": 4.7,
  "review_count": 3,
  "gtin": null,
  "mpn": "MAG Z890 TOMAHAWK WIFI",
  "scraped_at": "2026-07-02T17:06:28.752Z"
}
```

---

## Project Structure

```text
msi-product-scraper/
├── node_modules/
├── output/
│   └── product.json       # Generated output file
├── src/
│   └── scrape.js          # Core scraper script
├── .gitignore
├── package.json
└── README.md
```
