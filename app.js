// app.js
import { CanvasManager } from './canvasManager.js';

const cm = new CanvasManager('stage-container', { onHistory: handleHistoryPush });
window._cm = cm; // debug

const fileInput = document.getElementById('fileInput');
const previewModal = document.getElementById('previewModal');
const previewImage = document.getElementById('previewImage');

let historyStack = [], historyIndex = -1;
function handleHistoryPush(snapshot) {
  // snapshot is a string from canvasManager
  if (historyIndex >= 0 && historyStack[historyIndex] === snapshot) return;
  historyStack.splice(historyIndex + 1);
  historyStack.push(snapshot);
  historyIndex = historyStack.length - 1;
  updateUndoRedo();
}
function updateUndoRedo() {
  document.getElementById('undo').disabled = historyIndex <= 0;
  document.getElementById('redo').disabled = historyIndex >= historyStack.length - 1;
}
cm._commitHistoryImmediate(); // ensure initial

// UI: toolbar
document.getElementById('addText').addEventListener('click', () => {
  const t = cm.addText();
  cm.tr.nodes([t]);
});
fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    await cm.addImageFromFile(f);
  }
  fileInput.value = '';
});

// presets
document.querySelectorAll('.preset').forEach(btn => btn.addEventListener('click', () => cm.addPreset(btn.dataset.preset)));
document.getElementById('presetsBtn').addEventListener('click', () => document.getElementById('presetModal').classList.remove('hidden'));
document.getElementById('presetClose').addEventListener('click', () => document.getElementById('presetModal').classList.add('hidden'));

// grid toggle
document.getElementById('toggleGrid').addEventListener('click', () => cm.toggleGrid());

// preview modal
document.getElementById('previewBtn').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  previewImage.src = url;
  previewModal.classList.remove('hidden');
});
document.getElementById('closePreview').addEventListener('click', () => previewModal.classList.add('hidden'));

// preview actions
document.getElementById('downloadPreviewPNG').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  downloadDataUrl(url, `kai-preview-${Date.now()}.png`);
});
document.getElementById('downloadPreviewPDF').addEventListener('click', async () => {
  const pdf = await cm.toPDF();
  pdf.save(`kai-preview-${Date.now()}.pdf`);
});
document.getElementById('printPreview').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  const w = window.open('');
  w.document.write(`<img src="${url}" style="width:100%;height:auto" />`);
  w.document.close(); w.focus(); w.print();
});

// downloads
document.getElementById('downloadPNG').addEventListener('click', () => {
  const url = cm.toDataURL(2); downloadDataUrl(url, `kai-stickers-${Date.now()}.png`);
});
document.getElementById('downloadPDF').addEventListener('click', async () => {
  const pdf = await cm.toPDF(); pdf.save(`kai-stickers-${Date.now()}.pdf`);
});
document.getElementById('printBtn').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  const w = window.open('');
  w.document.write(`<img src="${url}" style="width:100%;height:auto" />`);
  w.document.close(); w.focus(); w.print();
});

// undo/redo
document.getElementById('undo').addEventListener('click', async () => { await cm.undo(); });
document.getElementById('redo').addEventListener('click', async () => { await cm.redo(); });

// save/load (localStorage)
const PROJECTS_KEY = 'kai_projects_v2';
function loadProjectList() {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '{}'); } catch { return {}; }
}
function saveProject(name) {
  const projects = loadProjectList();
  projects[name] = cm._serializeContent ? cm._serializeContent() : '';
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  renderProjects();
}
function renderProjects() {
  const list = document.getElementById('projectList'); list.innerHTML = '';
  const projects = loadProjectList();
  Object.keys(projects).forEach(k => {
    const el = document.createElement('div'); el.className = 'project-item';
    el.innerHTML = `<span>${k}</span><div class="actions"><button data-load="${k}">Load</button><button data-delete="${k}">Delete</button></div>`;
    list.appendChild(el);
  });
  list.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', (e) => {
    const name = e.target.dataset.load; const projects = loadProjectList(); const data = projects[name];
    if (!data) return;
    cm._restoreContent(data).then(()=> cm._commitHistoryImmediate());
  }));
  list.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', (e) => {
    const key = e.target.dataset.delete; const projects = loadProjectList(); delete projects[key]; localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); renderProjects();
  }));
}
document.getElementById('saveProject').addEventListener('click', () => {
  const nm = prompt('Save project name:', `project-${new Date().toISOString().slice(0,19).replace('T','_')}`);
  if (!nm) return; saveProject(nm);
});
document.getElementById('newProject').addEventListener('click', () => {
  if (!confirm('Create new project? Canvas will be cleared.')) return;
  cm.contentLayer.destroyChildren(); cm.contentLayer.add(cm.tr); cm.contentLayer.draw(); cm._commitHistoryImmediate(); renderProjects();
});
document.getElementById('clearAll').addEventListener('click', () => { if (!confirm('Clear all saved projects?')) return; localStorage.removeItem(PROJECTS_KEY); renderProjects(); });

renderProjects();

// text toolbar wiring
const textToolbar = document.getElementById('textToolbar');
const fontFamily = document.getElementById('fontFamily');
const fontSize = document.getElementById('fontSize');
const fontColor = document.getElementById('fontColor');
const boldBtn = document.getElementById('boldBtn');
const italicBtn = document.getElementById('italicBtn');
const underlineBtn = document.getElementById('underlineBtn');

function getSelectedTextNode() {
  const nodes = cm.getSelectedNodes(); if (!nodes || !nodes.length) return null;
  const n = nodes[0]; return n instanceof Konva.Text ? n : null;
}
function showTextToolbarFor(node) {
  if (!(node instanceof Konva.Text)) return;
  textToolbar.classList.remove('hidden');
  fontFamily.value = node.fontFamily() || 'Poppins';
  fontSize.value = Math.round(node.fontSize() || 36);
  fontColor.value = rgbToHex(node.fill() || '#111');
}
function hideTextToolbar() { textToolbar.classList.add('hidden'); }

fontFamily.addEventListener('change', () => { const n = getSelectedTextNode(); if (!n) return; ensureFont(fontFamily.value); n.fontFamily(fontFamily.value); cm.contentLayer.draw(); cm._commitHistory(); });
fontSize.addEventListener('input', () => { const n = getSelectedTextNode(); if (!n) return; n.fontSize(parseInt(fontSize.value||36,10)); cm.contentLayer.draw(); cm._commitHistory(); });
fontColor.addEventListener('input', () => { const n = getSelectedTextNode(); if (!n) return; n.fill(fontColor.value); cm.contentLayer.draw(); cm._commitHistory(); });
boldBtn.addEventListener('click', () => { const n = getSelectedTextNode(); if (!n) return; const cur = n.fontStyle()||''; n.fontStyle(cur.includes('bold')?cur.replace('bold','').trim():`${cur} bold`.trim()); cm.contentLayer.draw(); cm._commitHistory(); });
italicBtn.addEventListener('click', () => { const n = getSelectedTextNode(); if (!n) return; const cur = n.fontStyle()||''; n.fontStyle(cur.includes('italic')?cur.replace('italic','').trim():`${cur} italic`.trim()); cm.contentLayer.draw(); cm._commitHistory(); });
underlineBtn.addEventListener('click', () => { const n = getSelectedTextNode(); if (!n) return; const cur = n.textDecoration()||''; n.textDecoration(cur.includes('underline')? '': 'underline'); cm.contentLayer.draw(); cm._commitHistory(); });

window.addEventListener('canvas:selection', (e) => {
  const node = e.detail.node;
  if (node && node instanceof Konva.Text) showTextToolbarFor(node); else hideTextToolbar();
});

// keyboard shortcuts
let isCtrl = false;
window.addEventListener('keydown', (e) => {
  if (e.key === 'Control' || e.key === 'Meta') isCtrl = true;
  if (isCtrl && e.key.toLowerCase() === 'c') { e.preventDefault(); cm.copySelected(); }
  if (isCtrl && e.key.toLowerCase() === 'v') { e.preventDefault(); cm.pasteClipboard(); }
  if (isCtrl && e.key.toLowerCase() === 's') { e.preventDefault(); const nm = prompt('Save name:'); if (nm) saveProject(nm); }
  if (isCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); cm.undo(); }
  if ((isCtrl && e.key.toLowerCase() === 'y') || (isCtrl && e.shiftKey && e.key.toLowerCase() === 'z')) { e.preventDefault(); cm.redo(); }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); cm.deleteSelected(); }
  if (isCtrl && e.key.toLowerCase() === 'd') { e.preventDefault(); cm.duplicateSelected(); }
  if (isCtrl && e.key.toLowerCase() === 'g' && !e.shiftKey) { e.preventDefault(); cm.groupSelected(); }
  if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'g') { e.preventDefault(); cm.ungroupSelected(); }
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp') cm.nudgeSelected(0, -step);
    if (e.key === 'ArrowDown') cm.nudgeSelected(0, step);
    if (e.key === 'ArrowLeft') cm.nudgeSelected(-step, 0);
    if (e.key === 'ArrowRight') cm.nudgeSelected(step, 0);
    e.preventDefault();
  }
  if (e.key.toLowerCase() === 'p' && !isCtrl && !e.metaKey) { document.getElementById('previewBtn').click(); }
});
window.addEventListener('keyup', (e) => { if (e.key === 'Control' || e.key === 'Meta') isCtrl = false; });

// helper: download dataURL
function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a'); a.href = dataUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}

// helper: rgb to hex
function rgbToHex(rgb) {
  if (!rgb) return '#000'; if (rgb[0]==='#') return rgb;
  const m = rgb.match(/\d+/g); if (!m) return '#000';
  return '#' + m.slice(0,3).map(n=> (+n).toString(16).padStart(2,'0')).join('');
}

// ensure google font loaded
function ensureFont(family) {
  const id = 'gfont-' + family.replace(/\s+/g,'-');
  if (document.getElementById(id)) return;
  const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@300;400;600;800&display=swap`;
  document.head.appendChild(l);
}

// dark toggle
document.getElementById('darkToggle').addEventListener('click', () => document.body.classList.toggle('dark'));

// autosave (optional)
setInterval(() => { try { localStorage.setItem('kai_autosave_v1', cm._serializeContent()); } catch(e) {} }, 5000);
(function tryLoadAutosave(){ const raw = localStorage.getItem('kai_autosave_v1'); if (raw && confirm('Load autosave?')) { cm._restoreContent(raw).then(()=> cm._commitHistoryImmediate()); } })();
