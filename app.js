// app.js
import { CanvasManager } from './canvasManager.js';

const cm = new CanvasManager('stage-container', { onHistory: handleHistoryPush });
const fileInput = document.getElementById('fileInput');

// history stack
let history = [], historyIndex = -1;
function handleHistoryPush(snapshot) {
  const json = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
  if (historyIndex >= 0 && history[historyIndex] === json) return;
  history.splice(historyIndex + 1);
  history.push(json);
  historyIndex = history.length - 1;
  updateUndoRedo();
}
function restoreHistory(index) {
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  const json = history[historyIndex];
  try { cm.loadFromJSON(JSON.parse(json)); } catch(e) { console.warn(e); }
  updateUndoRedo();
}
function updateUndoRedo() {
  document.getElementById('undo').disabled = historyIndex <= 0;
  document.getElementById('redo').disabled = historyIndex >= history.length - 1;
}

// initial snapshot
handleHistoryPush(JSON.stringify(cm.serialize()));

// UI: presets buttons
document.querySelectorAll('.preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.preset;
    cm.addPreset(type);
  });
});

// preset modal
document.getElementById('presetsBtn').addEventListener('click', () => {
  document.getElementById('presetModal').classList.remove('hidden');
});
document.getElementById('presetClose').addEventListener('click', () => {
  document.getElementById('presetModal').classList.add('hidden');
});
document.querySelectorAll('#presetModal [data-preset]').forEach(b => {
  b.addEventListener('click', (e) => {
    cm.addPreset(e.target.dataset.preset);
    document.getElementById('presetModal').classList.add('hidden');
  });
});

// file upload handling
fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const node = await cm.addImageFromFile(f);
    // wire dragend to check insertion into presets
    node.on('dragend', () => {
      // try insert into a preset; if not inside preset, keep on content layer
      const inserted = cm.tryInsertIntoPreset(node);
      if (!inserted) {
        // nothing
      }
    });
  }
  fileInput.value = '';
});

// drag & drop files onto stage container
const stageContainer = document.getElementById('stage-container');
stageContainer.addEventListener('dragover', (e) => { e.preventDefault(); stageContainer.classList.add('dragover'); });
stageContainer.addEventListener('dragleave', () => stageContainer.classList.remove('dragover'));
stageContainer.addEventListener('drop', async (e) => {
  e.preventDefault(); stageContainer.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    for (const f of e.dataTransfer.files) {
      if (!f.type.startsWith('image/')) continue;
      const node = await cm.addImageFromFile(f);
      node.on('dragend', () => cm.tryInsertIntoPreset(node));
    }
  }
});

// add text
document.getElementById('addText').addEventListener('click', () => {
  const t = cm.addText();
  cm.transformer.nodes([t]);
  showTextToolbarFor(t);
});

// grid toggle
document.getElementById('toggleGrid').addEventListener('click', () => cm.toggleGrid());

// preview (50% scale)
const previewModal = document.getElementById('previewModal');
const previewImage = document.getElementById('previewImage');
document.getElementById('previewBtn').addEventListener('click', async () => {
  const url = cm.toDataURL(2); // high-res
  previewImage.src = url;
  // wrapper sized to 50% via CSS; image itself is full size but CSS scales down
  previewModal.classList.remove('hidden');
});
document.getElementById('closePreview').addEventListener('click', () => previewModal.classList.add('hidden'));

// preview export buttons
document.getElementById('downloadPreviewPNG').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  fetch(url).then(r => r.blob()).then(b => saveAs(b, `kai-sticker-${Date.now()}.png`));
});
document.getElementById('downloadPreviewPDF').addEventListener('click', async () => {
  const pdf = await cm.toPDF();
  pdf.save(`kai-sticker-${Date.now()}.pdf`);
});
document.getElementById('printPreview').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  const w = window.open('');
  w.document.write(`<img src="${url}" style="width:100%;height:auto" />`);
  w.document.close(); w.focus(); w.print();
});

// download / print (top toolbar)
document.getElementById('downloadPNG').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  fetch(url).then(r => r.blob()).then(b => saveAs(b, `kai-sticker-${Date.now()}.png`));
});
document.getElementById('downloadPDF').addEventListener('click', async () => {
  const pdf = await cm.toPDF();
  pdf.save(`kai-sticker-${Date.now()}.pdf`);
});
document.getElementById('printBtn').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  const w = window.open('');
  w.document.write(`<img src="${url}" style="width:100%;height:auto" />`);
  w.document.close(); w.focus(); w.print();
});

// undo / redo: we store snapshots via cm.onHistory handler
document.getElementById('undo').addEventListener('click', () => {
  if (historyIndex > 0) restoreHistory(historyIndex - 1);
});
document.getElementById('redo').addEventListener('click', () => {
  if (historyIndex < history.length - 1) restoreHistory(historyIndex + 1);
});

// keyboard shortcuts (copy/paste/delete/undo/redo/nudge/group/ungroup/duplicate/save/preview)
let isCtrl = false;
window.addEventListener('keydown', (e) => {
  if (e.key === 'Control' || e.key === 'Meta') isCtrl = true;

  // Save (Ctrl/Cmd+S)
  if (isCtrl && e.key.toLowerCase() === 's') {
    e.preventDefault();
    const nm = prompt('Save project as:', `project-${new Date().toISOString().slice(0,19).replace('T','_')}`);
    if (nm) saveProjectToStorage(nm);
  }

  // Copy (Ctrl/Cmd+C)
  if (isCtrl && e.key.toLowerCase() === 'c') { e.preventDefault(); cm.copySelected(); }

  // Paste (Ctrl/Cmd+V)
  if (isCtrl && e.key.toLowerCase() === 'v') { e.preventDefault(); cm.pasteClipboard(); }

  // Undo (Ctrl/Cmd+Z)
  if (isCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); if (historyIndex > 0) restoreHistory(historyIndex - 1); }

  // Redo (Ctrl/Cmd+Y) or Ctrl+Shift+Z
  if ((isCtrl && e.key.toLowerCase() === 'y') || (isCtrl && e.shiftKey && e.key.toLowerCase() === 'z')) {
    e.preventDefault(); if (historyIndex < history.length - 1) restoreHistory(historyIndex + 1);
  }

  // Delete
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); cm.deleteSelected(); }

  // Duplicate (Ctrl+D)
  if (isCtrl && e.key.toLowerCase() === 'd') { e.preventDefault(); cm.duplicateSelected(); }

  // Group (Ctrl+G)
  if (isCtrl && e.key.toLowerCase() === 'g' && !e.shiftKey) { e.preventDefault(); cm.groupSelected(); }

  // Ungroup (Ctrl+Shift+G)
  if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'g') { e.preventDefault(); cm.ungroupSelected(); }

  // Print (Ctrl+P)
  if (isCtrl && e.key.toLowerCase() === 'p') { e.preventDefault(); document.getElementById('printBtn').click(); }

  // Arrow nudge
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp') cm.nudgeSelected(0, -step);
    if (e.key === 'ArrowDown') cm.nudgeSelected(0, step);
    if (e.key === 'ArrowLeft') cm.nudgeSelected(-step, 0);
    if (e.key === 'ArrowRight') cm.nudgeSelected(step, 0);
    e.preventDefault();
  }

  // Preview (P)
  if (e.key.toLowerCase() === 'p' && !isCtrl && !e.metaKey) {
    document.getElementById('previewBtn').click();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Control' || e.key === 'Meta') isCtrl = false;
});

// save/load projects to localStorage
const PROJECTS_KEY = 'kai_projects_v1';
function loadProjectList() {
  const raw = localStorage.getItem(PROJECTS_KEY) || '{}';
  try { return JSON.parse(raw); } catch { return {}; }
}
function saveProjectToStorage(name) {
  const projects = loadProjectList();
  projects[name] = cm.serialize();
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  renderProjectList();
}
function deleteProject(name) {
  const projects = loadProjectList();
  delete projects[name];
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  renderProjectList();
}
function renderProjectList() {
  const list = document.getElementById('projectList'); list.innerHTML = '';
  const projects = loadProjectList();
  Object.keys(projects).forEach(k => {
    const el = document.createElement('div'); el.className = 'project-item';
    el.innerHTML = `<span>${k}</span><div class="actions">
      <button data-load="${k}">Load</button>
      <button data-delete="${k}">Delete</button>
    </div>`;
    list.appendChild(el);
  });
  list.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', (e) => {
    const name = e.target.dataset.load;
    const projects = loadProjectList();
    cm.loadFromJSON(projects[name]);
    handleHistoryPush(JSON.stringify(cm.serialize()));
  }));
  list.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', (e) => {
    const key = e.target.dataset.delete;
    deleteProject(key);
  }));
}
document.getElementById('saveProject').addEventListener('click', () => {
  const nm = prompt('Save project as:', `project-${new Date().toISOString().slice(0,19).replace('T','_')}`);
  if (!nm) return;
  saveProjectToStorage(nm);
});
document.getElementById('newProject').addEventListener('click', () => {
  if (!confirm('Create new project? Current canvas will be cleared.')) return;
  cm.contentLayer.destroyChildren(); cm.contentLayer.add(cm.transformer); cm.contentLayer.draw();
  handleHistoryPush(JSON.stringify(cm.serialize()));
});
document.getElementById('clearAll').addEventListener('click', () => {
  if (!confirm('Clear canvas?')) return;
  cm.contentLayer.destroyChildren(); cm.contentLayer.add(cm.transformer); cm.contentLayer.draw();
  handleHistoryPush(JSON.stringify(cm.serialize()));
});
renderProjectList();

// text toolbar wiring (lightweight)
const textToolbar = document.getElementById('textToolbar');
const fontFamily = document.getElementById('fontFamily');
const fontSize = document.getElementById('fontSize');
const fontColor = document.getElementById('fontColor');
const boldBtn = document.getElementById('boldBtn');
const italicBtn = document.getElementById('italicBtn');
const underlineBtn = document.getElementById('underlineBtn');

function getSelectedTextNode(){
  const nodes = cm.getSelectedNodes();
  if (!nodes || !nodes.length) return null;
  const n = nodes[0]; return n instanceof Konva.Text ? n : null;
}
function showTextToolbarFor(node){
  if (!(node instanceof Konva.Text)) return;
  textToolbar.classList.remove('hidden');
  fontFamily.value = node.fontFamily() || 'Poppins';
  fontSize.value = Math.round(node.fontSize() || 36);
  fontColor.value = rgbToHex(node.fill() || '#111');
}
function hideTextToolbar(){ textToolbar.classList.add('hidden'); }

fontFamily.addEventListener('change', () => {
  const node = getSelectedTextNode(); if (!node) return;
  ensureGoogleFontLoaded(fontFamily.value);
  node.fontFamily(fontFamily.value); cm.contentLayer.draw(); handleHistoryPush(JSON.stringify(cm.serialize()));
});
fontSize.addEventListener('input', () => {
  const node = getSelectedTextNode(); if (!node) return;
  node.fontSize(parseInt(fontSize.value||36,10)); cm.contentLayer.draw(); handleHistoryPush(JSON.stringify(cm.serialize()));
});
fontColor.addEventListener('input', () => {
  const node = getSelectedTextNode(); if (!node) return;
  node.fill(fontColor.value); cm.contentLayer.draw(); handleHistoryPush(JSON.stringify(cm.serialize()));
});
boldBtn.addEventListener('click', () => {
  const node = getSelectedTextNode(); if (!node) return;
  const cur = node.fontStyle() || '';
  node.fontStyle(cur.includes('bold') ? cur.replace('bold','').trim() : `${cur} bold`.trim());
  cm.contentLayer.draw(); handleHistoryPush(JSON.stringify(cm.serialize()));
});
italicBtn.addEventListener('click', () => {
  const node = getSelectedTextNode(); if (!node) return;
  const cur = node.fontStyle() || '';
  node.fontStyle(cur.includes('italic') ? cur.replace('italic','').trim() : `${cur} italic`.trim());
  cm.contentLayer.draw(); handleHistoryPush(JSON.stringify(cm.serialize()));
});
underlineBtn.addEventListener('click', () => {
  const node = getSelectedTextNode(); if (!node) return;
  const cur = node.textDecoration() || '';
  node.textDecoration(cur.includes('underline') ? '' : 'underline');
  cm.contentLayer.draw(); handleHistoryPush(JSON.stringify(cm.serialize()));
});

// helper functions
function rgbToHex(rgb){
  if (!rgb) return '#000';
  if (rgb[0] === '#') return rgb;
  const m = rgb.match(/\d+/g);
  if (!m) return '#000';
  return '#' + m.slice(0,3).map(n => (+n).toString(16).padStart(2,'0')).join('');
}
function ensureGoogleFontLoaded(family){
  const id = 'gfont-' + family.replace(/\s+/g,'-');
  if (document.getElementById(id)) return;
  const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@300;400;600;800&display=swap`;
  document.head.appendChild(l);
}

// ensure selected node causes text toolbar to show/hide
window.addEventListener('click', () => {
  const nodes = cm.getSelectedNodes();
  if (nodes && nodes.length === 1 && nodes[0] instanceof Konva.Text) showTextToolbarFor(nodes[0]);
  else hideTextToolbar();
});

// autosave quick snapshot to localStorage
setInterval(() => {
  const quick = cm.serialize();
  try { localStorage.setItem('kai_autosave', JSON.stringify(quick)); } catch(e) {}
}, 5000);
(function tryLoadAutosave(){
  const raw = localStorage.getItem('kai_autosave');
  if (raw && confirm('Load autosave from last session?')) {
    try { cm.loadFromJSON(JSON.parse(raw)); handleHistoryPush(JSON.stringify(cm.serialize())); } catch(e) {}
  }
})();

// stage fit
window.addEventListener('resize', () => cm.fitToContainer());
cm.fitToContainer();

// expose cm for debug
window._cm = cm;
