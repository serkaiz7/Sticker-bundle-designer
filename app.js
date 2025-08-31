// app.js
import { CanvasManager } from './canvasManager.js';

const cm = new CanvasManager('stage-container', { onHistory: handleHistoryPush });
const fileInput = document.getElementById('fileInput');

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
  try {
    cm._historyPos = index;
    cm._restoreHistoryAt(index);
  } catch (e) { console.warn(e); }
  updateUndoRedo();
}
function updateUndoRedo() {
  document.getElementById('undo').disabled = historyIndex <= 0;
  document.getElementById('redo').disabled = historyIndex >= history.length - 1;
}

// initial snapshot
handleHistoryPush(JSON.stringify(cm.contentLayer ? cm.contentLayer.toJSON() : ''));

// UI wiring
document.getElementById('addText').addEventListener('click', () => {
  const t = cm.addText();
  cm.transformer.nodes([t]);
});

fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const node = await cm.addImageFromFile(f);
    // node's own dragend will attempt insertion into preset automatically
  }
  fileInput.value = '';
});

// Drag & drop onto stage container
const stageContainer = document.getElementById('stage-container');
stageContainer.addEventListener('dragover', (e) => { e.preventDefault(); stageContainer.classList.add('dragover'); });
stageContainer.addEventListener('dragleave', () => stageContainer.classList.remove('dragover'));
stageContainer.addEventListener('drop', async (e) => {
  e.preventDefault(); stageContainer.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    for (const f of e.dataTransfer.files) {
      if (!f.type.startsWith('image/')) continue;
      await cm.addImageFromFile(f);
    }
  }
});

// presets UI
document.querySelectorAll('.preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.preset;
    cm.addPreset(type);
  });
});

// presets modal open/close
document.getElementById('presetsBtn').addEventListener('click', () => document.getElementById('presetModal').classList.remove('hidden'));
document.getElementById('presetClose').addEventListener('click', () => document.getElementById('presetModal').classList.add('hidden'));
document.querySelectorAll('#presetModal [data-preset]').forEach(b => {
  b.addEventListener('click', (e) => {
    cm.addPreset(e.target.dataset.preset);
    document.getElementById('presetModal').classList.add('hidden');
  });
});

// grid toggle
document.getElementById('toggleGrid').addEventListener('click', () => {
  cm.gridLayer.visible(!cm.gridLayer.visible());
  cm.gridLayer.draw();
});

// preview modal (50% scale)
const previewModal = document.getElementById('previewModal');
const previewImage = document.getElementById('previewImage');
document.getElementById('previewBtn').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  previewImage.src = url;
  previewModal.classList.remove('hidden');
});
document.getElementById('closePreview').addEventListener('click', () => previewModal.classList.add('hidden'));

// preview exports
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

// toolbar downloads and print
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

// undo/redo buttons
document.getElementById('undo').addEventListener('click', () => cm.undo());
document.getElementById('redo').addEventListener('click', () => cm.redo());

// keyboard shortcuts for copy/paste/delete/duplicate/group/ungroup/nudge/save/preview
let isCtrl = false;
window.addEventListener('keydown', (e) => {
  if (e.key === 'Control' || e.key === 'Meta') isCtrl = true;

  // Save
  if (isCtrl && e.key.toLowerCase() === 's') {
    e.preventDefault();
    const nm = prompt('Save project as:', `project-${new Date().toISOString().slice(0,19).replace('T','_')}`);
    if (nm) saveProjectToStorage(nm);
  }

  // Copy
  if (isCtrl && e.key.toLowerCase() === 'c') { e.preventDefault(); cm.copySelected(); }

  // Paste
  if (isCtrl && e.key.toLowerCase() === 'v') { e.preventDefault(); cm.pasteClipboard(); }

  // Undo
  if (isCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); cm.undo(); }

  // Redo
  if ((isCtrl && e.key.toLowerCase() === 'y') || (isCtrl && e.shiftKey && e.key.toLowerCase() === 'z')) {
    e.preventDefault(); cm.redo();
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
window.addEventListener('keyup', (e) => { if (e.key === 'Control' || e.key === 'Meta') isCtrl = false; });

// save/load projects to localStorage
const PROJECTS_KEY = 'kai_projects_v1';
function loadProjectList() {
  const raw = localStorage.getItem(PROJECTS_KEY) || '{}';
  try { return JSON.parse(raw); } catch { return {}; }
}
function saveProjectToStorage(name) {
  const projects = loadProjectList();
  projects[name] = cm.contentLayer.toJSON();
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
    try {
      cm.contentLayer.destroyChildren();
      const restored = Konva.Node.create(projects[name]);
      const children = restored.getChildren ? restored.getChildren().toArray() : [];
      children.forEach(ch => {
        ch.setAttr && ch.setAttr('selectable', true);
        cm._setupObject(ch, ch.getClassName() === 'Text');
        cm.contentLayer.add(ch);
      });
      cm.contentLayer.add(cm.transformer);
      cm.contentLayer.draw();
      cm._commitHistoryImmediate();
      renderProjectList();
    } catch (err) { console.warn(err); }
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
  cm._commitHistoryImmediate();
});
document.getElementById('clearAll').addEventListener('click', () => {
  if (!confirm('Clear all saved projects?')) return;
  localStorage.removeItem(PROJECTS_KEY);
  renderProjectList();
});
renderProjectList();

// text toolbar wiring
const textToolbar = document.getElementById('textToolbar');
const fontFamily = document.getElementById('fontFamily');
const fontSize = document.getElementById('fontSize');
const fontColor = document.getElementById('fontColor');
const boldBtn = document.getElementById('boldBtn');
const italicBtn = document.getElementById('italicBtn');
const underlineBtn = document.getElementById('underlineBtn');

function getSelectedTextNode(){
  const nodes = cm.getSelectedNodes(); if (!nodes || !nodes.length) return null;
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
  node.fontFamily(fontFamily.value); cm.contentLayer.draw(); cm._commitHistory();
});
fontSize.addEventListener('input', () => {
  const node = getSelectedTextNode(); if (!node) return;
  node.fontSize(parseInt(fontSize.value||36,10)); cm.contentLayer.draw(); cm._commitHistory();
});
fontColor.addEventListener('input', () => {
  const node = getSelectedTextNode(); if (!node) return;
  node.fill(fontColor.value); cm.contentLayer.draw(); cm._commitHistory();
});
boldBtn.addEventListener('click', () => {
  const node = getSelectedTextNode(); if (!node) return;
  const cur = node.fontStyle() || '';
  node.fontStyle(cur.includes('bold') ? cur.replace('bold','').trim() : `${cur} bold`.trim());
  cm.contentLayer.draw(); cm._commitHistory();
});
italicBtn.addEventListener('click', () => {
  const node = getSelectedTextNode(); if (!node) return;
  const cur = node.fontStyle() || '';
  node.fontStyle(cur.includes('italic') ? cur.replace('italic','').trim() : `${cur} italic`.trim());
  cm.contentLayer.draw(); cm._commitHistory();
});
underlineBtn.addEventListener('click', () => {
  const node = getSelectedTextNode(); if (!node) return;
  const cur = node.textDecoration() || '';
  node.textDecoration(cur.includes('underline') ? '' : 'underline');
  cm.contentLayer.draw(); cm._commitHistory();
});

// selection change handling: show/hide text toolbar
window.addEventListener('canvas:selection', (e) => {
  const node = e.detail.node;
  if (node && node instanceof Konva.Text) showTextToolbarFor(node);
  else hideTextToolbar();
});

// update zoom label from stage:scale
window.addEventListener('stage:scale', (e) => {
  const scale = e.detail.scale || cm.stage.scaleX() || 1;
  const percent = Math.round(scale * 100);
  document.getElementById('zoomLabel').textContent = `Zoom: ${percent}%`;
});

// autosave quick snapshot
setInterval(() => {
  try { localStorage.setItem('kai_autosave', JSON.stringify(cm.contentLayer.toJSON())); } catch(e) {}
}, 5000);
(function tryLoadAutosave(){
  const raw = localStorage.getItem('kai_autosave');
  if (raw && confirm('Load autosave from last session?')) {
    try {
      cm.contentLayer.destroyChildren();
      const restored = Konva.Node.create(raw);
      const children = restored.getChildren ? restored.getChildren().toArray() : [];
      children.forEach(ch => { ch.setAttr && ch.setAttr('selectable', true); cm._setupObject(ch, ch.getClassName()==='Text'); cm.contentLayer.add(ch); });
      cm.contentLayer.add(cm.transformer);
      cm.contentLayer.draw();
      cm._commitHistoryImmediate();
    } catch(e) { console.warn(e); }
  }
})();

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

// dark mode toggle
document.getElementById('darkToggle').addEventListener('click', () => document.body.classList.toggle('dark'));

// expose cm for debugging
window._cm = cm;
