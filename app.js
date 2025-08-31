// app.js
import { CanvasManager } from './canvasManager.js';

const cm = new CanvasManager('stage-container', { onHistory: handleHistoryPush });
const fileInput = document.getElementById('fileInput');

// History stack for undo/redo
let history = [], historyIndex = -1;
function handleHistoryPush(snapshot){
  const json = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
  // avoid duplicate pushes
  if (historyIndex >= 0 && history[historyIndex] === json) return;
  history.splice(historyIndex + 1);
  history.push(json);
  historyIndex = history.length - 1;
  updateUndoRedo();
}

// restore stage from history
function restoreHistory(index){
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  const json = history[historyIndex];
  try {
    cm.loadFromJSON(JSON.parse(json));
  } catch(e) {
    console.error('restore error', e);
  }
  updateUndoRedo();
}
function updateUndoRedo(){
  document.getElementById('undo').disabled = historyIndex <= 0;
  document.getElementById('redo').disabled = historyIndex >= history.length - 1;
}

// initial snapshot
handleHistoryPush(JSON.stringify(cm.serialize()));

// UI wiring
document.getElementById('addText').addEventListener('click', () => {
  const t = cm.addText();
  cm.transformer.nodes([t]);
  showTextToolbarFor(t);
});

fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    await cm.addImageFromFile(f);
  }
  fileInput.value = '';
});

// drag & drop onto stage container
const stageParent = document.getElementById('stage-container');
stageParent.addEventListener('dragover', (ev) => { ev.preventDefault(); stageParent.classList.add('dragover'); });
stageParent.addEventListener('dragleave', () => stageParent.classList.remove('dragover'));
stageParent.addEventListener('drop', async (ev) => {
  ev.preventDefault(); stageParent.classList.remove('dragover');
  if (ev.dataTransfer.files && ev.dataTransfer.files.length){
    for (const f of ev.dataTransfer.files){
      if (!f.type.startsWith('image/')) continue;
      await cm.addImageFromFile(f);
    }
  }
});

// grid toggle
document.getElementById('toggleGrid').addEventListener('click', () => cm.toggleGrid());
// presets modal
document.getElementById('presetsBtn').addEventListener('click', () => openPresetModal());
document.querySelectorAll('.preset').forEach(b => b.addEventListener('click', (e) => { cm.addPreset && cm.addPreset(e.target.dataset.preset); closePresetModal(); }));
// preset modal actions
document.getElementById('presetClose').addEventListener('click', closePresetModal);
function openPresetModal(){ document.getElementById('presetModal').classList.remove('hidden'); }
function closePresetModal(){ document.getElementById('presetModal').classList.add('hidden'); }

// preview & export
document.getElementById('previewBtn').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  document.getElementById('previewImage').src = url;
  document.getElementById('previewModal').classList.remove('hidden');
});
document.getElementById('closePreview').addEventListener('click', () => document.getElementById('previewModal').classList.add('hidden'));

// download PNG
document.getElementById('downloadPNG').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  fetch(url).then(r => r.blob()).then(b => saveAs(b, `kai-sticker-${Date.now()}.png`));
});
// download PDF
document.getElementById('downloadPDF').addEventListener('click', async () => {
  const pdf = await cm.toPDF();
  pdf.save(`kai-sticker-${Date.now()}.pdf`);
});
// print
document.getElementById('printBtn').addEventListener('click', () => {
  const url = cm.toDataURL(2);
  const w = window.open('');
  w.document.write(`<img src="${url}" style="width:100%;height:auto" />`);
  w.document.close(); w.focus(); w.print();
});

// basic projects storage (localStorage)
const PROJECTS_KEY = 'kai_projects_v1';
function loadProjectList(){
  const raw = localStorage.getItem(PROJECTS_KEY) || '{}';
  try {
    return JSON.parse(raw);
  } catch { return {}; }
}
function saveProjectToStorage(name){
  const projects = loadProjectList();
  projects[name] = cm.serialize();
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  renderProjectList();
}
function deleteProject(name){
  const projects = loadProjectList();
  delete projects[name];
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  renderProjectList();
}
function renderProjectList(){
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
  cm.loadFromJSON({}); // not ideal; clear content
  handleHistoryPush(JSON.stringify(cm.serialize()));
});
document.getElementById('clearAll').addEventListener('click', () => {
  if (!confirm('Clear canvas?')) return;
  cm.contentLayer.destroyChildren(); cm.contentLayer.add(cm.transformer); cm.contentLayer.draw();
  handleHistoryPush(JSON.stringify(cm.serialize()));
});

// text toolbar interactions
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

// keyboard shortcuts and interactions
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
  if (isCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); if (historyIndex > 0) restoreHistory(historyIndex - 1); }

  // Redo
  if ((isCtrl && e.key.toLowerCase() === 'y') || (isCtrl && e.shiftKey && e.key.toLowerCase() === 'z')) {
    e.preventDefault(); if (historyIndex < history.length - 1) restoreHistory(historyIndex + 1);
  }

  // Delete
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); cm.deleteSelected(); }

  // Duplicate (Ctrl + D)
  if (isCtrl && e.key.toLowerCase() === 'd') { e.preventDefault(); cm.duplicateSelected(); }

  // Group
  if (isCtrl && e.key.toLowerCase() === 'g' && !e.shiftKey) { e.preventDefault(); cm.groupSelected(); }

  // Ungroup
  if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'g') { e.preventDefault(); cm.ungroupSelected(); }

  // Print
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

// selection change event: show text toolbar if text selected
cm.transformer.on('transform', () => {});
cm.transformer.on('transformend', () => {});
window.addEventListener('click', () => {
  const nodes = cm.getSelectedNodes();
  if (nodes && nodes.length === 1 && nodes[0] instanceof Konva.Text) showTextToolbarFor(nodes[0]);
  else hideTextToolbar();
});

// autosave to localStorage periodically
setInterval(() => {
  const quick = cm.serialize();
  localStorage.setItem('kai_autosave', JSON.stringify(quick));
}, 5000);

// load autosave if present
(function tryLoadAutosave(){
  const raw = localStorage.getItem('kai_autosave');
  if (raw && confirm('Load autosave from last session?')) {
    try { cm.loadFromJSON(JSON.parse(raw)); handleHistoryPush(JSON.stringify(cm.serialize())); } catch(e) {}
  }
})();

// project list render
renderProjectList();

// small helpers
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

// UI: font pills
document.querySelectorAll('.font-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    const f = btn.dataset.font;
    ensureGoogleFontLoaded(f);
    const n = cm.getSelectedNodes()[0];
    if (n && n instanceof Konva.Text) { n.fontFamily(f); cm.contentLayer.draw(); handleHistoryPush(JSON.stringify(cm.serialize())); }
  });
});

// project load/delete buttons are rendered in renderProjectList()

// adapt stage to container (fit)
window.addEventListener('resize', () => cm.fitToContainer());
cm.fitToContainer();

// show/hide presets UI
document.getElementById('menuToggle').addEventListener('click', () => {
  const s = document.getElementById('sidebar');
  s.style.display = s.style.display === 'none' ? 'block' : 'none';
});

// minimal missing methods fallback for CanvasManager (presets)
if (!cm.addPreset) {
  cm.addPreset = function(type){
    if (type === 'grid'){
      const cols = 4, rows = 3, pad = 18;
      const cellW = (cm.A4.w - pad*(cols+1)) / cols;
      const cellH = (cm.A4.h - pad*(rows+1)) / rows;
      for (let r=0;r<rows;r++){
        for (let c=0;c<cols;c++){
          const rect = new Konva.Rect({
            x: pad + c*(cellW+pad),
            y: pad + r*(cellH+pad),
            width: cellW, height: cellH, cornerRadius: 12, fill:'#fff', stroke:'#ddd', dash:[6,6],
            draggable:true, name:'object', selectable:true
          });
          cm._setupObject(rect,false);
          cm.contentLayer.add(rect);
        }
      }
      cm.contentLayer.draw(); cm._commitHistory();
    } else if (type === 'circles'){
      const count = 8;
      for (let i=0;i<count;i++){
        const angle = (i / count) * Math.PI*2;
        const cx = cm.A4.w/2 + Math.cos(angle) * 220;
        const cy = cm.A4.h/2 + Math.sin(angle) * 140;
        const circle = new Konva.Circle({
          x: cx, y: cy, radius: 80, fill:'#fff', stroke:'#ddd', dash:[6,6],
          draggable:true, name:'object', selectable:true
        });
        cm._setupObject(circle,false);
        cm.contentLayer.add(circle);
      }
      cm.contentLayer.draw(); cm._commitHistory();
    } else if (type === 'labels'){
      const cols=2, rows=5, pad=22;
      const cellW = (cm.A4.w - pad*(cols+1)) / cols;
      const cellH = (cm.A4.h - pad*(rows+1)) / rows;
      for (let r=0;r<rows;r++){
        for (let c=0;c<cols;c++){
          const rect = new Konva.Rect({
            x: pad + c*(cellW+pad), y: pad + r*(cellH+pad),
            width: cellW, height: cellH, cornerRadius: 10, fill:'#fff', stroke:'#ddd', dash:[6,6],
            draggable:true, name:'object', selectable:true
          });
          cm._setupObject(rect,false); cm.contentLayer.add(rect);
        }
      }
      cm.contentLayer.draw(); cm._commitHistory();
    }
  };
}
