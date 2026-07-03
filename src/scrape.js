import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// --- Helper functions for parsing page data blocks ---

async function parseBreadcrumbs(page) {
  const category_tree = [];
  let product_category = null;

  const breadcrumbItems = page.locator('.breadcrumb .breadcrumb-item:not(:first-child)');
  const count = await breadcrumbItems.count();

  if (count > 0) {
    const categoryNames = [];

    for (let i = 0; i < count; i++) {
      const item = breadcrumbItems.nth(i);
      const linkElement = item.locator('a');
      let name = '';
      let urlValue = null;

      if (await linkElement.count() > 0) {
        name = (await linkElement.first().textContent() || '').trim();

        const href = await linkElement.first().getAttribute('href');
        urlValue = href ? new URL(href, page.url()).href : null;
      } else {
        name = (await item.textContent() || '').trim();
      }

      category_tree.push({ name, url: urlValue });

      if (i < count - 1) {
        categoryNames.push(name);
      }
    }

    if (categoryNames.length > 0) {
      product_category = categoryNames.join(' > ');
    }
  }

  return { product_category, category_tree };
}

async function parsePricingAndAvailability(page) {
  let price = null;
  let sale_price = null;
  let availability = null;

  const priceContainer = page.locator('.text-right').first();

  if (await priceContainer.count() > 0) {
    const oldPriceElement = priceContainer.locator('#prices-old');
    const newPriceElement = priceContainer.locator('#prices-new');

    if (await oldPriceElement.count() > 0) {
      const rawOld = await oldPriceElement.first().textContent();
      const rawNew = await newPriceElement.first().textContent();

      price = rawOld ? parseFloat(rawOld.replace(/[$,]/g, '').trim()) : null;
      sale_price = rawNew ? parseFloat(rawNew.replace(/[$,]/g, '').trim()) : null;
    } else if (await newPriceElement.count() > 0) {
      const rawNew = await newPriceElement.first().textContent();
      price = rawNew ? parseFloat(rawNew.replace(/[$,]/g, '').trim()) : null;
    } else {
      // Fallback: no dedicated old/new price ids found,
      // try to read a generic price element within the container
      const genericPrice = priceContainer.locator('[class*="price"]').first();
      if (await genericPrice.count() > 0) {
        const rawGeneric = await genericPrice.textContent();
        const parsed = rawGeneric ? parseFloat(rawGeneric.replace(/[$,]/g, '').trim()) : null;
        if (!Number.isNaN(parsed)) {
          price = parsed;
        }
      }
    }

    const statusElement = priceContainer.locator('span', { hasText: /stock|order/i }).first();
    if (await statusElement.count() > 0) {
      const rawStatus = await statusElement.textContent();
      if (rawStatus) {
        const cleanStatus = rawStatus.trim().toLowerCase();
        if (cleanStatus.includes('in stock')) availability = 'in_stock';
        else if (cleanStatus.includes('out of stock')) availability = 'out_of_stock';
        else if (cleanStatus.includes('pre order') || cleanStatus.includes('pre-order')) availability = 'pre_order';
      }
    }
  }

  return { price, sale_price, availability };
}

async function parseImages(page) {
  let image_url = null;
  const additional_image_urls = [];

  const mainImageElement = page.locator('img#imagePopup').first();
  if (await mainImageElement.count() > 0) {
    image_url = await mainImageElement.getAttribute('src');
  }

  const thumbElements = page.locator('img.product-detail-thumb-bto');
  const thumbCount = await thumbElements.count();

  if (thumbCount > 0) {
    const uniqueUrls = new Set();
    for (let i = 0; i < thumbCount; i++) {
      const popupUrl = await thumbElements.nth(i).getAttribute('popup_img');
      if (popupUrl && popupUrl !== image_url) {
        uniqueUrls.add(popupUrl.trim());
      }
    }
    additional_image_urls.push(...uniqueUrls);
  }

  return { image_url, additional_image_urls };
}

async function parseDescription(page) {
  const descParagraph = page.locator('.crop-text-2 + div > p').first();
  const descList = page.locator('#description-list');

  const pText = (await descParagraph.count() > 0)
    ? (await descParagraph.textContent() || '').replace(/\s+/g, ' ').trim()
    : '';

  let listItems = [];
  if (await descList.count() > 0) {
    const rawItems = await descList.locator('li').allTextContents();
    listItems = rawItems
      .map(item => item.replace(/\s+/g, ' ').trim())
      .map(item => item.replace(/\.$/, ''))
      .filter(Boolean);
  }

  const parts = [];
  if (pText) parts.push(pText);
  if (listItems.length > 0) {
    parts.push(listItems.map(item => `- ${item}`).join('\n'));
  }

  const combinedDesc = parts.join('\n\n');
  return combinedDesc || null;
}

async function parseRating(page) {
  let star_rating = null;
  let review_count = null;

  const ratingElement = page.locator('#average-rating-info').first();
  if (await ratingElement.count() > 0) {
    const rawRatingText = await ratingElement.textContent();
    if (rawRatingText) {
      const match = rawRatingText.match(/([\d.]+)\s*\((\d+)\)/);
      if (match) {
        star_rating = parseFloat(match[1]);
        review_count = parseInt(match[2], 10);
      }
    }
  }

  return { star_rating, review_count };
}

async function parseSpecs(page) {
  const specs = [];
  let mpn = null;

  const specRows = page.locator('.my-margin table.table-borderless tbody tr');
  const rowsCount = await specRows.count();

  for (let i = 0; i < rowsCount; i++) {
    const row = specRows.nth(i);
    const keyElement = row.locator('th');
    const valueElement = row.locator('td');

    if (await keyElement.count() > 0 && await valueElement.count() > 0) {
      const name = (await keyElement.first().textContent() || '').trim();
      const value = (await valueElement.first().textContent() || '').replace(/\s+/g, ' ').trim();

      if (name && value) {
        specs.push({ name, value });
        if (name.toLowerCase() === 'manufacturer number') {
          mpn = value;
        }
      }
    }
  }

  return { specs, mpn };
}

async function parseItemId(page) {
  const itemIdElement = page.locator('#product_qty input[name="product_id"]').first();
  if (await itemIdElement.count() > 0) {
    const rawId = await itemIdElement.getAttribute('value');
    return rawId ? rawId.trim() : null;
  }
  return null;
}

// --- Main scraping process ---

async function runScraper() {
  console.log('Launching Chromium in headless mode...');
  const browser = await chromium.launch({ headless: true });

  try {
    // Custom headers to reduce chance of bot detection
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-platform': '"Windows"',
      }
    });

    const page = await context.newPage();

    const defaultUrl = 'https://us-store.msi.com/Motherboards/Intel-Platform-Motherboard/INTEL-Z890/MAG-Z890-TOMAHAWK-WIFI';
    const targetUrl = process.argv[2] || defaultUrl;

    console.log(`Navigating to: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 60000 });

    console.log('Waiting for content to load...');
    await page.waitForSelector('h2.title.crop-text-2', { timeout: 15000 });

    console.log('Extracting data...');

    const titleElement = page.locator('h2.title.crop-text-2').first();
    const titleText = await titleElement.textContent();
    const title = titleText ? titleText.trim() : null;

    const { product_category, category_tree } = await parseBreadcrumbs(page);
    const { price, sale_price, availability } = await parsePricingAndAvailability(page);
    const { image_url, additional_image_urls } = await parseImages(page);
    const description = await parseDescription(page);
    const { star_rating, review_count } = await parseRating(page);
    const { specs, mpn } = await parseSpecs(page);
    const item_id = await parseItemId(page);

    const productData = {
      url: page.url(),
      item_id,
      title,
      brand: 'MSI',
      product_category,
      category_tree,
      description,
      price,
      sale_price,
      availability,
      image_url,
      additional_image_urls,
      specs,
      star_rating,
      review_count,
      gtin: null,
      mpn,
      scraped_at: new Date().toISOString()
    };

    const outputDir = path.join(process.cwd(), 'output');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(path.join(outputDir, 'product.json'), JSON.stringify(productData, null, 2), 'utf-8');
    console.log('Data successfully extracted and saved to output/product.json');

  } catch (err) {
    console.error('Scraping failed:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runScraper();