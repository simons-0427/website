"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const assetRoot = process.env.FILTER_PACKAGE_ROOT ? path.resolve(root, process.env.FILTER_PACKAGE_ROOT) : root;
const english = process.env.FILTER_LANGUAGE === "en";
const locale = english ? "en-US" : "de-DE";
const applyLabel = english ? "Apply filters" : "Filter anwenden";
const qualitySearch = english ? "protein quality" : "eiweißqualität";
const minimumSearch = english ? "at least" : "mindestens";
const screenshotPrefix = english ? "nutrition-en" : "nutrition";
const indexPath = process.env.FILTER_INDEX_OVERRIDE ? path.resolve(root, process.env.FILTER_INDEX_OVERRIDE)
  : process.env.FILTER_PACKAGE_ROOT ? path.resolve(assetRoot, english ? "en/nutrition/index.html" : "ernaerung/index.html")
  : path.resolve(root, english ? "../en/nutrition/index.html" : "index.html");

function food(name, protein, score, sodium, price, tags = ["vegan", "whole_food"]) {
  const nutrients = { "Energy (cal)": 200, "Protein (g)": protein, "Sodium (mg)": sodium, "AAS (%)": 999 };
  if (score != null) {
    for (const [key, reference] of Object.entries({
      "Histidine (mg)": 15, "Isoleucine (mg)": 30, "Leucine (mg)": 59,
      "Lysine (mg)": 45, "Methionine (mg)": 22, "Cystine (mg)": 0,
      "Phenylalanine (mg)": 38, "Tyrosine (mg)": 0, "Threonine (mg)": 23,
      "Tryptophan (mg)": 6, "Valine (mg)": 39,
    })) nutrients[key] = protein * reference * score / 100;
  }
  return { name, unit: "g", price_per_100: price, price_per_100_us: price, price_per_100_uk: price, category: "huelsenfruechte", tags, nutrients };
}
const fixtures = [
  food("Alpha", 30, 100, 10, .5),
  food("Beta", 20, 80, 30, .4, ["vegetarisch", "whole_food"]),
  food("Gamma", 10, 60, 1, .3),
  food("Delta", 0, null, null, .1, ["vegan", "verarbeitet"]),
  food("Epsilon", 25, 85, 50, .6),
  food("Zeta", 20.5, 90, 5, 2),
  food("Eta", 30, null, 5, .7),
];
let useFixtures = true;
const mime = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".md": "text/plain", ".css": "text/css" };
const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (!process.env.FILTER_PACKAGE_ROOT && pathname.startsWith("/ernaerung/")) pathname = pathname.slice("/ernaerung".length);
  if ((pathname === "/database.json" || pathname === "/ernaerung/database.json") && useFixtures) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(fixtures));
  }
  const file = pathname === "/" || pathname === "/index.html" ? indexPath : path.resolve(assetRoot, "." + pathname);
  if ((file !== indexPath && !file.startsWith(assetRoot + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale });
    await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const pagePath = process.env.FILTER_PACKAGE_ROOT ? (english ? "/en/nutrition/index.html" : "/ernaerung/index.html") : "/";
    await page.goto(origin + pagePath);
    await page.waitForFunction(text => document.getElementById("foodCount").textContent.includes(text), english ? "7 foods" : "7 Lebensmittel");
    const names = () => page.locator('#dbTable input[data-k="name"]').evaluateAll(elements => elements.map(input => input.value).sort());
    const expectNames = async expected => assert.deepEqual(await names(), [...expected].sort());
    const open = () => page.locator("#dbAdvancedOpen").click();
    const setRule = async (index, param, operator, value) => {
      const row = page.locator(".db-advanced-rule").nth(index);
      await row.locator("[data-advanced-param-open]").click();
      await page.locator("#dbParamSearch").fill(param);
      await page.locator(`[data-advanced-param-option=${JSON.stringify(param)}]`).click();
      await row.locator("[data-advanced-operator-open]").click();
      await page.locator(`[data-advanced-operator-option=${JSON.stringify(operator)}]`).click();
      await row.locator("[data-advanced-value]").fill(String(value));
    };
    const apply = () => page.getByRole("button", { name: applyLabel, exact: true }).click();
    const single = async (param, operator, value) => {
      await open(); await setRule(0, param, operator, value); await apply();
    };

    await single("Protein (g)", "gt", 20);
    await expectNames(["Alpha", "Epsilon", "Eta", "Zeta"]);
    await open();
    await page.locator("[data-advanced-param-open]").first().click();
    const options = await page.locator("[data-advanced-param-option]").evaluateAll(elements => elements.map(element => element.dataset.advancedParamOption));
    for (const param of ["AAS (%)", "PFAS-4 (ng)", "Fluid (ml)", "Selenium (µg)", "price"]) assert.ok(options.includes(param), `parameter missing: ${param}`);
    assert.ok(options.length > 60);
    assert.equal(options[options.indexOf("Protein (g)") + 1], "AAS (%)");
    assert.equal(options.at(-1), "Fluid (ml)");
    await page.locator("#dbParamSearch").fill(qualitySearch);
    assert.equal(await page.locator("[data-advanced-param-option]").count(), 1);
    await page.locator("#dbParamSearch").fill("kein-passender-parameter");
    assert.equal(await page.locator("[data-advanced-param-option]").count(), 0);
    await page.keyboard.press("Escape");
    assert.ok(await page.locator("#dbAdvancedModal").isVisible());
    assert.equal(await page.locator("[data-advanced-param]").first().inputValue(), "Protein (g)");
    await page.locator("#dbAdvancedAdd").click();
    await setRule(1, "AAS (%)", "gte", 80); await apply();
    await expectNames(["Alpha", "Epsilon", "Zeta"]);
    await open(); await page.locator("#dbAdvancedAdd").click();
    await setRule(2, "Sodium (mg)", "lte", 10); await apply();
    await expectNames(["Alpha", "Zeta"]);
    assert.equal(await page.locator("#dbAdvancedFilterCount").textContent(), "3");
    await page.locator('#dbFilters [data-diet="vegan"]').click();
    await page.locator('#dbFilters [data-tag="supplement"]').click(); await expectNames([]);
    await page.locator('#dbFilters [data-tag="supplement"]').click();
    await page.locator("#dbSearch").fill("Alpha");
    await page.waitForFunction(() => document.querySelectorAll('#dbTable input[data-k="name"]').length === 1);
    await expectNames(["Alpha"]);
    await page.locator("#dbSearch").fill("");
    await page.waitForFunction(() => document.querySelectorAll('#dbTable input[data-k="name"]').length === 2);
    await open(); await setRule(0, "Protein (g)", "gt", 100);
    await page.locator("#dbAdvancedCancel").click(); await expectNames(["Alpha", "Zeta"]);
    await page.locator('[data-density="kcal"]').click(); await expectNames(["Alpha", "Zeta"]);
    await page.locator('[data-db-advanced-remove="2"]').click(); await expectNames(["Alpha", "Epsilon", "Zeta"]);
    await page.locator("[data-db-advanced-clear]").click();
    await page.locator('#dbFilters [data-diet="all"]').click();
    for (const [operator, expected] of [
      ["gte", ["Alpha", "Beta", "Epsilon", "Eta", "Zeta"]],
      ["gt", ["Alpha", "Epsilon", "Eta", "Zeta"]],
      ["lte", ["Beta", "Delta", "Gamma"]],
      ["lt", ["Delta", "Gamma"]], ["eq", ["Beta"]],
    ]) { await single("Protein (g)", operator, 20); await expectNames(expected); }
    await single("Sodium (mg)", "eq", 0); await expectNames(["Delta"]);
    await single("AAS (%)", "lte", 80); await expectNames(["Beta", "Gamma"]);
    await single("price", "lte", .5); await expectNames(["Alpha", "Beta", "Delta", "Gamma"]);
    await open(); await page.locator("[data-advanced-value]").fill(""); await apply();
    assert.ok(await page.locator("#dbAdvancedModal").isVisible());
    await page.locator("[data-advanced-value]").fill("-1"); await apply();
    assert.ok(await page.locator("#dbAdvancedModal").isVisible());
    await page.keyboard.press("Escape");
    await open(); await page.locator("[data-advanced-remove]").click(); await apply();
    assert.equal((await names()).length, fixtures.length);
    assert.ok(await page.locator("#dbAdvancedSummary").isHidden());
    assert.deepEqual(errors, []);
    await context.close();

    useFixtures = false;
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const realContext = await browser.newContext({ viewport, locale });
      await realContext.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      const realPage = await realContext.newPage();
      const packagedErrors = [];
      realPage.on("pageerror", error => packagedErrors.push(error.message));
      realPage.on("response", response => {
        if (response.status() >= 400 && !response.url().includes("/images/favicons/")) packagedErrors.push(`${response.status()} ${response.url()}`);
      });
      await realPage.goto(origin + pagePath);
      await realPage.waitForFunction(text => document.getElementById("foodCount").textContent.includes(text), english ? "1636 foods" : "1636 Lebensmittel");
      // Keep screenshots stable when browser actions scroll to the database section.
      await realPage.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
      const trigger = await realPage.locator("#dbAdvancedOpen").boundingBox();
      assert.ok(trigger.x + trigger.width <= viewport.width && trigger.width >= 40);
      await realPage.locator("#dbAdvancedOpen").click();
      await realPage.locator("[data-advanced-value]").fill("20");
      await realPage.locator("#dbAdvancedAdd").click();
      await realPage.locator("[data-advanced-param-open]").nth(1).click();
      const picker = await realPage.locator("#dbParamModal").boundingBox();
      assert.ok(Math.abs(picker.x + picker.width / 2 - viewport.width / 2) <= 2, "parameter picker not horizontally centered");
      assert.ok(Math.abs(picker.y + picker.height / 2 - viewport.height / 2) <= 2, "parameter picker not vertically centered");
      assert.ok(picker.y > 0 && picker.y + picker.height < viewport.height, "parameter picker touches screen edge");
      await realPage.screenshot({ path: path.join(os.tmpdir(), `${screenshotPrefix}-param-picker-${viewport.width}.png`) });
      await realPage.locator("#dbParamSearch").fill(qualitySearch);
      await realPage.locator("#dbParamSearch").press("ArrowDown");
      await realPage.keyboard.press("Enter");
      assert.equal(await realPage.locator("[data-advanced-param]").nth(1).inputValue(), "AAS (%)");
      await realPage.locator("[data-advanced-operator-open]").nth(1).click();
      assert.equal(await realPage.locator("#dbParamTitle").textContent(), english ? "Choose condition" : "Bedingung auswählen");
      assert.equal(await realPage.locator("[data-advanced-operator-option]").count(), 5);
      const operatorPicker = await realPage.locator("#dbParamModal").boundingBox();
      assert.ok(Math.abs(operatorPicker.x + operatorPicker.width / 2 - viewport.width / 2) <= 2);
      assert.ok(Math.abs(operatorPicker.y + operatorPicker.height / 2 - viewport.height / 2) <= 2);
      await realPage.screenshot({ path: path.join(os.tmpdir(), `${screenshotPrefix}-condition-picker-${viewport.width}.png`) });
      await realPage.locator("#dbParamSearch").fill(minimumSearch);
      assert.equal(await realPage.locator("[data-advanced-operator-option]").count(), 1);
      await realPage.locator("#dbParamSearch").press("Enter");
      assert.equal(await realPage.locator("[data-advanced-operator]").nth(1).inputValue(), "gte");
      await realPage.locator("[data-advanced-value]").nth(1).fill("80");
      assert.ok(await realPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const dialogFits = await realPage.locator("#dbAdvancedModal").evaluate(element => element.scrollWidth <= element.clientWidth + 1);
      assert.ok(dialogFits, `dialog overflow at ${viewport.width}px`);
      const modalBox = await realPage.locator("#dbAdvancedModal").boundingBox();
      assert.ok(Math.abs(modalBox.x + modalBox.width / 2 - viewport.width / 2) <= 2, "filter dialog not horizontally centered");
      assert.ok(Math.abs(modalBox.y + modalBox.height / 2 - viewport.height / 2) <= 2, "filter dialog not vertically centered");
      const footer = await realPage.locator(".db-advanced-foot").boundingBox();
      assert.ok(footer.y >= 0 && footer.y + footer.height <= viewport.height + 1, `filter actions outside viewport at ${viewport.width}px`);
      const submitBox = await realPage.getByRole("button", { name: applyLabel, exact: true }).boundingBox();
      assert.ok(submitBox.y >= 0 && submitBox.y + submitBox.height <= viewport.height + 1, `apply button outside viewport at ${viewport.width}px`);
      const screenshot = path.join(os.tmpdir(), `${screenshotPrefix}-advanced-filters-${viewport.width}.png`);
      await realPage.screenshot({ path: screenshot });
      console.log(`Screenshot: ${screenshot}`);
      await realPage.getByRole("button", { name: applyLabel, exact: true }).click();
      assert.ok(await realPage.locator('#dbTable input[data-k="name"]').count() > 0);
      assert.equal(await realPage.locator("#dbAdvancedFilterCount").textContent(), "2");
      await realPage.locator(".db-note-row").scrollIntoViewIfNeeded();
      await realPage.screenshot({ path: path.join(os.tmpdir(), `${screenshotPrefix}-advanced-filters-active-${viewport.width}.png`) });
      if (process.env.FILTER_PACKAGE_ROOT) {
        await realPage.locator("#tab-btn-plan").click();
        await realPage.locator("label.switch-wrap:has(#integerAmounts)").click();
        assert.ok(await realPage.locator("#integerAmounts").isChecked());
        await realPage.locator("#calc").click();
        await realPage.waitForFunction(() => document.querySelectorAll("#planFoodBody tr").length > 0 && !document.getElementById("calc").disabled, undefined, { timeout: 30000 });
        assert.deepEqual(packagedErrors, [], "packaged page has missing dependencies or browser errors");
        console.log(`${english ? "English" : "German"} package ${viewport.width}px: integer plan calculated in browser`);
      }
      await realContext.close();
    }
    console.log(`${english ? "English" : "German"} advanced filters: comparisons, AAS, missing values, existing filters, cancellation and responsive UI: ok`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
