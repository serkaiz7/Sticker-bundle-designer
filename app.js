// Entry point for Kai Sticker Maker
import {
  initCanvas, addImageLayer, getSelectedLayer, toJSON, loadFromJSON,
  exportPNG, exportSVG, toggleCutLines, autoArrangeGrid, makeTextSticker, deleteSelected,
  pushHistory, undoHistory, redoHistory, resetHistory
} from './canvasManager.js';

const fileInput = document.getElementById('file-input');
const thumbnails = document.getElementById('thumbnails');
const autoArrangeBtn = document.getElementById('auto-arrange');
const traceBtn = document.getElementById('trace-selected');
const saveBtn = document.getElementById('save-project');
const saveBtn2 = document.getElementById('save-project-2');
const loadBtn = document.getElementById('load-project');
const loadBtn2 = document.getElementById('load-project-2');
const loadInput = document.getElementById('load-input');
const exportPngBtn = document.getElementById('export-png');
const exportSvgBtn = document.getElementById('export-svg');
const toggleCutBtn = document.getElementById('toggle-cut');
const presetButtons = document.querySelectorAll('.preset');
const makeTextBtn = document.getElementById('make-text');
const deleteBtn = document.getElementById('delete-layer');
const propLock = document.getElementById('prop-lock');
const propRotation = document.getElementById('prop-rotation');
const propScale = document.getElementById('prop-scale');
const propText = document.getElementById('prop-text');

const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');

const openActions = document.getElementById('open-actions');
const leftPanel = document.getElementById('left-panel');
const rightPanel = document.getElementById('right-panel');

initCanvas(); // canvas manager reads DPI select and fits stage

// upload handler
fileInput.addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files || []);
  for(const f of files){
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.src = url;
    await img.decode();
    await addImageLayer(img, f.name);
    const thumb = document.createElement('img');
    thumb.src = url; thumb.className='thumb';
    thumbnails.appendChild(thumb);
  }
  pushHistory(); // new layers added
});

// buttons
autoArrangeBtn.addEventListener('click', ()=>{ autoArrangeGrid(); pushHistory(); });
traceBtn.addEventListener('click', async ()=>{
  const sel = getSelectedLayer();
  if(!sel){ alert('Select an image sticker first'); return; }
  await sel.traceSilhouette();
  pushHistory();
});
toggleCutBtn.addEventListener('click', ()=>toggleCutLines());

saveBtn.addEventListener('click', ()=> {
  const json = toJSON();
  const blob = new Blob([JSON.stringify(json, null, 2)], {type: 'application/json'});
  saveAs(blob, 'kai-sticker-project.json');
});
saveBtn2 && saveBtn2.addEventListener('click', ()=> saveBtn.click());

loadBtn.addEventListener('click', ()=> loadInput.click());
loadBtn2 && loadBtn2.addEventListener('click', ()=> loadInput.click());
loadInput.addEventListener('change', async (e)=>{
  const f = e.target.files[0];
  if(!f) return;
  const text = await f.text();
  const json = JSON.parse(text);
  loadFromJSON(json);
  resetHistory(); // new loaded state
});

// export
exportPngBtn.addEventListener('click', async ()=>{
  const blob = await exportPNG();
  saveAs(blob, 'kai-sticker-sheet.png');
});
exportSvgBtn.addEventListener('click', ()=>{
  const svg = exportSVG();
  const blob = new Blob([svg], {type:'image/svg+xml;charset=utf-8'});
  saveAs(blob, 'kai-sticker-sheet.svg');
});

// presets
presetButtons.forEach(btn => btn.addEventListener('click', ()=>{
  const p = btn.dataset.preset;
  if(p==='3x3') autoArrangeGrid(3,3);
  if(p==='row-6') autoArrangeGrid(6,1);
  pushHistory();
}));

// property panel updater
setInterval(()=>{
  const sel = getSelectedLayer();
  const layerControls = document.getElementById('layer-controls');
  const noSel = document.getElementById('no-selection');
  if(!sel){ layerControls.hidden = true; noSel.style.display='block'; return; }
  noSel.style.display='none'; layerControls.hidden = false;
  propLock.checked = sel.locked || false;
  propRotation.value = sel.rotation || 0;
  propScale.value = sel.scaleX || 1;
  propText.value = sel.text || '';
}, 160);

// property bindings
propLock.addEventListener('change', ()=>{ const sel=getSelectedLayer(); if(!sel) return; sel.locked = propLock.checked; sel.group.draggable(!sel.locked); pushHistory(); });
propRotation.addEventListener('input', ()=>{ const sel=getSelectedLayer(); if(!sel) return; sel.rotation = Number(propRotation.value); sel.group.rotation(sel.rotation); sel.group.getLayer().batchDraw(); pushHistory();});
propScale.addEventListener('input', ()=>{ const sel=getSelectedLayer(); if(!sel) return; const s=Number(propScale.value); sel.scaleX=s; sel.scaleY=s; sel.group.scale({x:s,y:s}); sel.group.getLayer().batchDraw(); pushHistory();});
makeTextBtn.addEventListener('click', ()=>{ makeTextSticker(propText.value || 'Label'); pushHistory(); });
deleteBtn.addEventListener('click', ()=>{ deleteSelected(); pushHistory(); });

// Undo / Redo
undoBtn && undoBtn.addEventListener('click', ()=> { undoHistory(); });
redoBtn && redoBtn.addEventListener('click', ()=> { redoHistory(); });

// keyboard shortcuts
window.addEventListener('keydown', (e)=>{
  const z = (e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='z';
  const y = (e.ctrlKey || e.metaKey) && (e.key.toLowerCase()==='y' || (e.shiftKey && e.key.toLowerCase()==='z'));
  if(z){ e.preventDefault(); undoHistory(); }
  if(y){ e.preventDefault(); redoHistory(); }
});

// mobile toggle for panels
openActions && openActions.addEventListener('click', ()=>{
  leftPanel.classList.toggle('open');
  rightPanel.classList.toggle('open');
});

// small utility
window.SB = { exportSVG };
console.log('Kai Sticker Maker ready');
