export function selectMotif(state, motif) {
  return {
    ...state,
    motif: state.motif === motif ? null : motif,
    line: null,
    sku: null,
  };
}
export function selectLine(state, line) {
  return {
    ...state,
    line: state.line === line ? null : line,
    sku: null,
  };
}
export function selectProduct(state, sku) {
  return {
    ...state,
    sku: state.sku === sku ? null : sku,
  };
}
