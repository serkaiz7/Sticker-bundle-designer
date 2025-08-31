// app.js


// exports
document.getElementById('exportPNG').addEventListener('click', ()=>{
const dataURL = manager.toDataURL(4);
fetch(dataURL).then(res=>res.blob()).then(blob=>saveAs(blob, 'kai-sticker.png'));
});


document.getElementById('exportPDF').addEventListener('click', ()=> manager.exportPDF());


document.getElementById('undoBtn').addEventListener('click', ()=> manager.undo());
document.getElementById('redoBtn').addEventListener('click', ()=> manager.redo());


document.getElementById('deleteSelection')?.addEventListener('click', ()=> manager.deleteSelection());


// preview modal
const previewModal = document.getElementById('previewModal');
const previewContent = document.getElementById('previewContent');
document.getElementById('previewBtn').addEventListener('click', ()=>{
const dataURL = manager.toDataURL(2);
previewContent.innerHTML = `<img src="${dataURL}" style="max-width:100%">`;
previewModal.setAttribute('aria-hidden','false');
});
document.getElementById('closePreview').addEventListener('click', ()=> previewModal.setAttribute('aria-hidden','true'));


// zoom controls
const zoomVal = document.getElementById('zoomVal');
document.getElementById('zoomIn').addEventListener('click', ()=>{ manager.setScale(manager.scale * 1.1); zoomVal.textContent = Math.round(manager.scale*100)+'%'; });
document.getElementById('zoomOut').addEventListener('click', ()=>{ manager.setScale(manager.scale * 0.9); zoomVal.textContent = Math.round(manager.scale*100)+'%'; });


// keyboard shortcuts
window.addEventListener('keydown', (e)=>{
const cmd = e.ctrlKey || e.metaKey;
if(cmd && e.key.toLowerCase()==='z' && !e.shiftKey){ e.preventDefault(); manager.undo(); }
if((cmd && e.shiftKey && e.key.toLowerCase()==='z') || (cmd && e.key.toLowerCase()==='y')){ e.preventDefault(); manager.redo(); }
if(cmd && e.key.toLowerCase()==='c'){ e.preventDefault(); manager.copySelection(); }
if(cmd && e.key.toLowerCase()==='v'){ e.preventDefault(); manager.pasteClipboard(); }
if(e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); manager.deleteSelection(); }
if(e.key.startsWith('Arrow')){
e.preventDefault(); // nudge selected nodes
const step = e.shiftKey ? 10 : 1; const page = manager.getCurrent(); const nodes = page.tr.nodes(); if(nodes.length){ nodes.forEach(n=>{ const d = {x:0,y:0}; if(e.key==='ArrowUp') d.y = -step; if(e.key==='ArrowDown') d.y = step; if(e.key==='ArrowLeft') d.x = -step; if(e.key==='ArrowRight') d.x = step; n.position({x:n.x()+d.x, y:n.y()+d.y}); page.layer.draw(); }); manager._saveHistory(); }
}
if(cmd && e.key.toLowerCase()==='g'){ e.preventDefault(); if(e.shiftKey) manager.ungroupSelection(); else manager.groupSelection(); }
});


// autosave every 5 seconds
setInterval(()=> manager.saveToLocal(), 5000);


// theme toggle
const modeToggle = document.getElementById('modeToggle'); modeToggle.addEventListener('change', ()=> document.body.classList.toggle('dark'));


// New project
document.getElementById('newProject').addEventListener('click', ()=> location.reload());


// small niceties: fit button
document.getElementById('fitBtn').addEventListener('click', ()=> manager.setScale(1));


// page management buttons
const pageTabs = document.getElementById('pageTabs'); const addPageBtn = document.getElementById('addPage');
function renderTabs(){ pageTabs.innerHTML = ''; for(let i=0;i<manager.pages.length;i++){ const b = document.createElement('button'); b.textContent = 'Page '+(i+1); b.className = i===manager.currentPage? 'active':''; b.addEventListener('click', ()=>{ manager.currentPage = i; renderTabs(); }); pageTabs.appendChild(b);} }
addPageBtn.addEventListener('click', ()=>{ manager.addPage(); renderTabs(); }); renderTabs();


// small: populate object list
setInterval(()=>{
const list = document.getElementById('objectList'); list.innerHTML=''; const page=manager.getCurrent(); if(!page) return; const shapes = page.layer.getChildren().toArray().filter(n=>n.getClassName()!=='Transformer' && n.getClassName()!=='Rect'); shapes.forEach((s, idx)=>{ const el=document.createElement('div'); el.className='obj'; el.textContent = s.getClassName()+' #'+(idx+1); el.addEventListener('click', ()=>{ page.tr.nodes([s]); page.layer.draw(); }); list.appendChild(el); }); }, 1000);


// initial load if present
manager.loadFromLocal();
