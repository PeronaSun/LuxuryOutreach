import test from "node:test";
import assert from "node:assert/strict";
import { resolvePurchaseDisplay } from "../src/product-display.mjs";
import { products, lines, motifs } from "../data/catalog.mjs";

const catalog = { products, lines, motifs };

test("all 15 purchase labels resolve their canonical SKU, Motif, Line, category and description", () => {
  for (const product of products) {
    const display = resolvePurchaseDisplay({ sku: product.sku }, catalog);
    const line = lines.find((item) => item.id === product.line);
    assert.equal(display.known, true);
    assert.equal(display.sku, product.sku);
    assert.equal(display.motif.id, product.motif);
    assert.equal(display.line.id, product.line);
    assert.equal(display.category, product.category);
    assert.equal(display.description, product.name);
    assert.equal(
      display.label,
      `${line.name}（${line.zh}）${product.category}`,
    );
  }
});

test("Rosée purchase labels match the requested Line and category convention", () => {
  assert.equal(
    resolvePurchaseDisplay({ sku: "MUG-R-N01" }, catalog).label,
    "Rosée du Matin（晨露）项链",
  );
  assert.equal(
    resolvePurchaseDisplay({ sku: "MUG-R-B01" }, catalog).label,
    "Rosée du Matin（晨露）手镯",
  );
});

test("shortened or inconsistent purchase names cannot rename a canonical product", () => {
  const purchase = Object.freeze({
    id: "EXISTING-PURCHASE",
    sku: "MUG-R-N01",
    productName: "旧系统缩写 / 非官方名称",
    line: "aqua",
    category: "戒指",
    purchaseDate: "2026-08-22",
    purchasePrice: 29800,
  });
  const before = JSON.stringify(purchase);
  const display = resolvePurchaseDisplay(purchase, catalog);
  assert.equal(display.label, "Rosée du Matin（晨露）项链");
  assert.equal(display.line.id, "rosee");
  assert.equal(display.motif.id, "muguet");
  assert.equal(JSON.stringify(purchase), before);
});

test("unknown historical SKU remains identifiable without inventing a product name", () => {
  const display = resolvePurchaseDisplay(
    { sku: "UNKNOWN", productName: "虚构别名" },
    catalog,
  );
  assert.equal(display.known, false);
  assert.equal(display.sku, "UNKNOWN");
  assert.equal(display.label, "目录资料未找到");
  assert.equal(display.description, null);
});

test("an inconsistent catalog relationship cannot produce an official-looking label", () => {
  const display = resolvePurchaseDisplay(
    { sku: "MUG-R-N01" },
    {
      ...catalog,
      lines: lines.map((line) =>
        line.id === "rosee" ? { ...line, motif: "jasmin" } : line,
      ),
    },
  );
  assert.equal(display.known, false);
  assert.equal(display.line, null);
});
