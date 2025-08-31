// Entry point for Kai Sticker Maker
import {
  initCanvas, addImageLayer, getSelectedLayer, toJSON, loadFromJSON,
  exportPNG, exportSVG, toggleCutLines, autoArrangeGrid, makeTextSticker, deleteSelected
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

// extra mobile elements
const openActions = document.getElementById('open-actions');
const leftPanel = document.getElementById('left-panel');
const rightPanel = document.getElementById('right-panel');

initCanvas();

// upload handler
fileInput.addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files || []);
  for(const f of files){
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.src = url;
    await img.decode();
    addImageLayer(img, f.name);
    const thumb = document.createElement('img');
    thumb.src = url; thumb.className='thumb';
    thumbnails.appendChild(thumb);
  }
});

// buttons
autoArrangeBtn.addEventListener('click', ()=>autoArrangeGrid());
traceBtn.addEventListener('click', async ()=>{
  const sel = getSelectedLayer();
  if(!sel){ alert('Select an image sticker first'); return; }
  await sel.traceSilhouette();
});
toggleCutBtn.addEventListener('click', ()=>toggleCutLines());

saveBtn.addEventListener('click', ()=>{
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
});

exportPngBtn.addEventListener('click', async ()=>{
  const blob = await exportPNG();
  saveAs(blob, 'kai-sticker-sheet.png');
});
exportSvgBtn.addEventListener('click', ()=>{
  const svg = exportSVG();
  const blob = new Blob([svg], {type:'image/svg+xml;charset=utf-8'});
  saveAs(blob, 'kai-sticker-sheet.svg');
});

presetButtons.forEach(btn => btn.addEventListener('click', ()=>{
  const p = btn.dataset.preset;
  if(p==='3x3') autoArrangeGrid(3,3);
  if(p==='row-6') autoArrangeGrid(6,1);
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
propLock.addEventListener('change', ()=>{ const sel=getSelectedLayer(); if(!sel) return; sel.locked = propLock.checked; sel.group.draggable(!sel.locked); });
propRotation.addEventListener('input', ()=>{ const sel=getSelectedLayer(); if(!sel) return; sel.rotation = Number(propRotation.value); sel.group.rotation(sel.rotation); sel.group.getLayer().batchDraw(); });
propScale.addEventListener('input', ()=>{ const sel=getSelectedLayer(); if(!sel) return; const s=Number(propScale.value); sel.scaleX=s; sel.scaleY=s; sel.group.scale({x:s,y:s}); sel.group.getLayer().batchDraw(); });
makeTextBtn.addEventListener('click', ()=>makeTextSticker(propText.value || 'Label'));
deleteBtn.addEventListener('click', ()=>deleteSelected());

// mobile toggle for panels
openActions && openActions.addEventListener('click', ()=>{
  leftPanel.classList.toggle('open');
  rightPanel.classList.toggle('open');
});

// small utility
window.SB = { exportSVG };
console.log('Kai Sticker Maker ready');
