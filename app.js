/* app.js
 * UI wiring, history stack, drag&drop uploads, text toolbar, exports, presets.
 */
import { CanvasManager } from './canvasManager.js';

const cm = new CanvasManager('stage-container', handleHistoryPush);

// --------- History (undo/redo) ----------
const history = [];
let historyIndex = -1;
function handleHistoryPush(json){
  // Avoid duplicates when nothing changed
  if (historyIndex >= 0 && history[historyIndex] === json) return;
  // Truncate forward
  history.splice(historyIndex + 1);
  history.push(json);
  historyIndex = history.length - 1;
  updateUndoRedoButtons();
}
function restoreFromHistory(index){
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  const json = history[historyIndex];
  // Rebuild stage content layer nodes except background/grid/guides
  const stage = cm.stage;
  const restored = Konva.Node.create(json, cm.stage.container());
  // Keep layers order; replace contentLayer children only
  cm.contentLayer.destroyChildren();
  const restoredCL = restored.findOne(node => node.getClassName && node.getClassName() === 'Layer' && node._id === cm.contentLayer._id);
  if (restoredCL){
    restoredCL.getChildren().forEach(ch => {
      // ensure rewire events
      if (ch.name && ch.name() === 'object'){
        cm.contentLayer.add(ch);
        cm._wireNode(ch, ch.getClassName() === 'Text');
      } else if (ch.getClassName() === 'Transformer'){
        cm.contentLayer.add(cm.transformer);
      } else if (ch.getClassName() === 'Rect' && ch === cm.selectionRect){
        // skip
      } else {
        cm.contentLayer.add(ch);
      }
    });
  }
  cm.contentLayer.draw();
}
function updateUndoRedoButtons(){
  document.getElementById('btn-undo').disabled = historyIndex <= 0;
  document.getElementById('btn-redo').disabled = historyIndex >= history.length - 1;
}
document.getElementById('btn-undo').addEventListener('click', () => {
  if (historyIndex > 0) restoreFromHistory(historyIndex - 1);
});
document.getElementById('btn-redo').addEventListener('click', () => {
  if (historyIndex < history.length - 1) restoreFromHistory(historyIndex + 1);
});
// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (historyIndex > 0) restoreFromHistory(historyIndex - 1);
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    if (historyIndex < history.length - 1) restoreFromHistory(historyIndex + 1);
  }
});

// Start with an empty snapshot
handleHistoryPush(cm.stage.toJSON());

// --------- Uploads (file picker + drag & drop) ----------
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    await cm.addImageFromFile(file);
  }
  fileInput.value = '';
});

const container = cm.stage.container();
container.addEventListener('dragover', (e) => { e.preventDefault(); container.classList.add('dragover'); });
container.addEventListener('dragleave', () => container.classList.remove('dragover'));
container.addEventListener('drop', async (e) => {
  e.preventDefault();
  container.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length){
    for (const file of e.dataTransfer.files) {
      if (file.type.startsWith('image/')) await cm.addImageFromFile(file);
    }
  }
});

// --------- Text Stickers ----------
document.getElementById('btn-add-text').addEventListener('click', () => {
  const t = cm.addText();
  cm.transformer.nodes([t]);
  showTextToolbar(t);
});
function showTextToolbar(node){ cm._showTextToolbarIfText(node); }
function hideTextToolbar(){ cm._hideTextToolbar(); }

// Floating toolbar bindings
const fontFamilySel = document.getElementById('font-family');
const fontSizeInp = document.getElementById('font-size');
const fontColorInp = document.getElementById('font-color');
const btnBold = document.getElementById('btn-bold');
const btnItalic = document.getElementById('btn-italic');
const btnUnderline = document.getElementById('btn-underline');

function getSelectedTextNode(){
  const nodes = cm.transformer.nodes();
  if (!nodes || !nodes.length) return null;
  const n = nodes[0];
  return n instanceof Konva.Text ? n : null;
}

fontFamilySel.addEventListener('change', () => {
  const n = getSelectedTextNode(); if (!n) return;
  ensureGoogleFontLoaded(fontFamilySel.value);
  n.fontFamily(fontFamilySel.value);
  cm.contentLayer.draw(); cm._commitHistory();
});
fontSizeInp.addEventListener('input', () => {
  const n = getSelectedTextNode(); if (!n) return;
  n.fontSize(parseInt(fontSizeInp.value || '48', 10));
  cm.contentLayer.draw(); cm._commitHistory();
});
fontColorInp.addEventListener('input', () => {
  const n = getSelectedTextNode(); if (!n) return;
  n.fill(fontColorInp.value);
  cm.contentLayer.draw(); cm._commitHistory();
});
btnBold.addEventListener('click', () => toggleStyle('bold', btnBold));
btnItalic.addEventListener('click', () => toggleStyle('italic', btnItalic));
btnUnderline.addEventListener('click', () => {
  const n = getSelectedTextNode(); if (!n) return;
  const on = btnUnderline.dataset.toggle !== 'true';
  btnUnderline.dataset.toggle = on.toString();
  n.textDecoration(on ? 'underline' : '');
  cm.contentLayer.draw(); cm._commitHistory();
});
function toggleStyle(flag, btnEl){
  const n = getSelectedTextNode(); if (!n) return;
  const on = btnEl.dataset.toggle !== 'true';
  btnEl.dataset.toggle = on.toString();
  const style = n.fontStyle().split(' ').filter(Boolean);
  const has = style.includes(flag);
  n.fontStyle(on ? [...style, flag].join(' ') : style.filter(s => s !== flag).join(' '));
  cm.contentLayer.draw(); cm._commitHistory();
}

// --------- Grid Toggle ----------
document.getElementById('btn-toggle-grid').addEventListener('click', () => cm.toggleGrid());

// --------- Presets (top button + sidebar buttons) ----------
document.getElementById('btn-presets').addEventListener('click', () => cm.addPreset('grid'));
document.querySelectorAll('.preset').forEach(btn => {
  btn.addEventListener('click', () => cm.addPreset(btn.dataset.preset));
});

// Font pills
document.querySelectorAll('.font-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    ensureGoogleFontLoaded(btn.dataset.font);
    fontFamilySel.value = btn.dataset.font;
    const n = getSelectedTextNode();
    if (n){ n.fontFamily(btn.dataset.font); cm.contentLayer.draw(); cm._commitHistory(); }
  });
});

// --------- Preview & Export ----------
const previewModal = document.getElementById('preview-modal');
document.getElementById('btn-preview').addEventListener('click', () => {
  const img = document.getElementById('preview-image');
  img.src = cm.toDataURL(2);
  previewModal.showModal();
});
document.getElementById('preview-close').addEventListener('click', () => previewModal.close());

document.getElementById('btn-download-png').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kai-sticker-${Date.now()}.png`;
  a.click();
});
document.getElementById('btn-download-pdf').addEventListener('click', async () => {
  const pdf = await cm.toPDF();
  pdf.save(`kai-sticker-${Date.now()}.pdf`);
});
document.getElementById('btn-print').addEventListener('click', () => {
  const w = window.open('', 'PRINT', 'height=800,width=1100');
  if (!w) return;
  const dataUrl = cm.toDataURL(2);
  w.document.write(`<img src="${dataUrl}" style="width:100%;height:auto;" />`);
  w.document.close();
  w.focus();
  w.print();
});

// --------- Mobile hamburger (show/hide sidebar) ----------
const menuBtn = document.getElementById('btn-menu');
const sidebar = document.getElementById('sidebar');
menuBtn.addEventListener('click', () => {
  if (sidebar.style.display === 'block') sidebar.style.display = 'none';
  else sidebar.style.display = 'block';
});

// --------- Utilities ----------
function ensureGoogleFontLoaded(family){
  // inject once per unique family
  const id = `gfont-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;600;800&display=swap`;
  document.head.appendChild(link);
}

// Expose for console debugging
window._cm = cm;
