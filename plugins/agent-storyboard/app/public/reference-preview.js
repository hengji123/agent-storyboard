export function bindReferenceAssetActions(preview, remove, open, drop) {
  preview.onclick = event => { event.preventDefault(); open(); };
  remove.onclick = event => { event.preventDefault(); event.stopPropagation(); return drop(); };
}
