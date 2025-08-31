import {initCanvas, addImageLayer, getSelectedLayer, toJSON, loadFromJSON, exportPNG, exportSVG, toggleCutLines, autoArrangeGrid, makeTextSticker, deleteSelected} from './canvasManager.js';


toggleCutBtn.addEventListener('click', ()=>toggleCutLines());


saveBtn.addEventListener('click', ()=>{
const json = toJSON();
const blob = new Blob([JSON.stringify(json, null, 2)], {type: 'application/json'});
saveAs(blob, 'sticker-project.json');
});


loadBtn.addEventListener('click', ()=> loadInput.click());
loadInput.addEventListener('change', async (e)=>{
const f = e.target.files[0];
if(!f) return;
const text = await f.text();
const json = JSON.parse(text);
loadFromJSON(json);
});


exportPngBtn.addEventListener('click', async ()=>{
const blob = await exportPNG();
saveAs(blob, 'sticker-sheet.png');
});


exportSvgBtn.addEventListener('click', ()=>{
const svg = exportSVG();
const blob = new Blob([svg], {type:'image/svg+xml;charset=utf-8'});
saveAs(blob, 'sticker-sheet.svg');
});


presetButtons.forEach(btn=>btn.addEventListener('click', ()=>{
const p = btn.dataset.preset;
if(p==='3x3') autoArrangeGrid(3,3);
if(p==='row-6') autoArrangeGrid(6,1);
}));


// Properties panel bindings
setInterval(()=>{
const sel = getSelectedLayer();
const layerControls = document.getElementById('layer-controls');
const noSel = document.getElementById('no-selection');
if(!sel){ layerControls.style.display='none'; noSel.style.display='block'; return; }
noSel.style.display='none'; layerControls.style.display='block';
propLock.checked = sel.locked || false;
propRotation.value = sel.rotation || 0;
propScale.value = sel.scaleX || 1;
propText.value = sel.text || '';
}, 200);


propLock.addEventListener('change', ()=>{
const sel = getSelectedLayer(); if(!sel) return; sel.locked = propLock.checked; sel.group.draggable(!sel.locked);
});
propRotation.addEventListener('input', ()=>{ const sel=getSelectedLayer(); if(!sel) return; sel.rotation = Number(propRotation.value); sel.group.rotation(sel.rotation); sel.group.getLayer().batchDraw(); });
propScale.addEventListener('input', ()=>{ const sel=getSelectedLayer(); if(!sel) return; const s=Number(propScale.value); sel.scaleX=s; sel.scaleY=s; sel.group.scale({x:s,y:s}); sel.group.getLayer().batchDraw(); });
makeTextBtn.addEventListener('click', ()=>makeTextSticker(propText.value || 'Label'));
deleteBtn.addEventListener('click', ()=>deleteSelected());


// expose for debugging
window.SBDesigner = { exportSVG };


console.log('Sticker Bundle Designer initialized');
