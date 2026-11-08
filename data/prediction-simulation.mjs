// Offline fixture generator only. Requests consume the persisted JSON, never randomize.
export const PREDICTION_VERSION = "simulated-platform-v1-post-v5";
export const PREDICTION_SEED = 20261107;
function randomFor(clientId, seed) {
  let state = seed >>> 0;
  for (const c of clientId)
    state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export function simulatePredictions(profiles, catalog, seed = PREDICTION_SEED) {
  return Object.fromEntries(
    profiles.map((client) => {
      const random = randomFor(client.id, seed),
        count = 1 + Math.floor(random() * 3);
      const onlyMaterial = /只考虑|仅考虑/.test(
        client.latestPreference?.text || "",
      )
        ? client.latestPreference.material
        : null;
      const ranked = catalog
        .filter((p) => !onlyMaterial || p.material === onlyMaterial)
        .map((product) => {
          const matches = new Set();
          let weight = 1;
          for (const interest of client.interests) {
            for (const [key, points, label] of [
              ["sku", 18, "已知作品方向"],
              ["line", 12, "已知系列方向"],
              ["motif", 8, "已知自然意象"],
              ["category", 5, "已知品类方向"],
              ["material", 4, "已知材质方向"],
              ["gemstone", 6, "已知宝石方向"],
            ])
              if (interest[key] && interest[key] === product[key]) {
                weight += points;
                matches.add(label);
              }
          }
          if (client.latestPreference?.material === product.material) {
            weight += 8;
            matches.add("近期材质方向");
          }
          // Reproducible random tie-breaking preserves stronger known affinities.
          return { product, key: -(weight + random()), matches: [...matches] };
        })
        .sort(
          (a, b) => a.key - b.key || a.product.sku.localeCompare(b.product.sku),
        );
      return [
        client.id,
        ranked.slice(0, count).map(({ product, matches }, index) => ({
          sku: product.sku,
          line: product.line,
          motif: product.motif,
          rank: index + 1,
          rationale: matches.length
            ? `固定种子模拟，参考${matches.join("、")}；不代表客户明确偏好。`
            : "固定种子模拟探索；资料不足，不推断客户偏好。",
          source: "simulated_platform_prediction",
          isSimulated: true,
          version: PREDICTION_VERSION,
        })),
      ];
    }),
  );
}
