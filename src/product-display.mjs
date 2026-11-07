// Presentation-only labels, composed from the canonical Line and category.
// The Brand Bible does not define separate SKU marketing names. Purchase data is never rewritten.
export function resolvePurchaseDisplay(purchase, catalog) {
  const product = catalog.products.find((item) => item.sku === purchase.sku);
  const line =
    product &&
    catalog.lines.find(
      (item) => item.id === product.line && item.motif === product.motif,
    );
  const motif =
    product && catalog.motifs.find((item) => item.id === product.motif);
  if (!product || !line || !motif) {
    return {
      known: false,
      sku: purchase.sku,
      label: "目录资料未找到",
      description: null,
      motif: null,
      line: null,
      category: null,
    };
  }
  return {
    known: true,
    sku: product.sku,
    label: `${line.name}（${line.zh}）${product.category}`,
    description: product.name,
    motif,
    line,
    category: product.category,
  };
}
