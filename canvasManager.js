/* canvasManager.js
this._saveHistory();
}


_makeTransformable(node){
node.on('dblclick', ()=>{ // edit
const absPos = node.getAbsolutePosition(); const stage = node.getStage();
const textarea = document.createElement('textarea');
document.body.appendChild(textarea);
textarea.value = node.text ? node.text() : '';
textarea.style.position='absolute'; textarea.style.left = (stage.x() + absPos.x) + 'px'; textarea.style.top = (stage.y() + absPos.y) + 'px';
textarea.style.font = '16px sans-serif'; textarea.focus();
textarea.onblur = ()=>{ if(node.text) node.text(textarea.value); textarea.remove(); this.getCurrent().layer.draw(); this._saveHistory(); };
});


node.on('transformend', ()=> this._saveHistory());
node.on('dragend', ()=> this._saveHistory());
}


deleteSelection(){ const page=this.getCurrent(); const nodes = page.tr.nodes(); nodes.forEach(n=>n.destroy()); page.tr.nodes([]); page.layer.draw(); this._saveHistory(); }


copySelection(){ const page=this.getCurrent(); const nodes = page.tr.nodes(); if(!nodes.length) return; const clone = nodes[0].clone(); this.clipboard = clone.toJSON(); }
pasteClipboard(){ if(!this.clipboard) return; const page=this.getCurrent(); const node = Konva.Node.create(this.clipboard); node.x(node.x()+20); node.y(node.y()+20); page.layer.add(node); this._makeTransformable(node); page.layer.draw(); this._saveHistory(); }


groupSelection(){ const page=this.getCurrent(); const nodes = page.tr.nodes(); if(nodes.length<2) return; const group = new Konva.Group({draggable:true}); nodes.forEach(n=>group.add(n)); page.layer.add(group); page.tr.nodes([group]); page.layer.draw(); this._saveHistory(); }
ungroupSelection(){ const page=this.getCurrent(); const nodes = page.tr.nodes(); nodes.forEach(n=>{ if(n.getClassName()==='Group'){ const items = n.getChildren().toArray(); n.destroy(); items.forEach(i=>page.layer.add(i)); } }); page.layer.draw(); this._saveHistory(); }


toDataURL(pixelRatio=3){ const page=this.getCurrent(); return page.stage.toDataURL({ pixelRatio }); }


exportPDF(filename='kai-stickers.pdf'){
const dataURL = this.toDataURL(3);
const { jsPDF } = window.jspdf;
const pdf = new jsPDF({orientation:'landscape', unit:'pt', format:[this.baseWidth*this.dpi/96, this.baseHeight*this.dpi/96]});
pdf.addImage(dataURL, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
pdf.save(filename);
}


_saveHistory(skipPush=false){
try{ const snapshot = this.getSnapshot(); if(skipPush) { this.history.push(snapshot); return; } this.history.push(snapshot); this.future = []; if(this.history.length>50) this.history.shift(); }catch(e){console.warn(e)}
}
getSnapshot(){ // serialize current page only for simplicity
const json = this.getCurrent().stage.toJSON(); return json;
}
undo(){ if(this.history.length<2) return; const last = this.history.pop(); this.future.push(last); const prev = this.history[this.history.length-1]; this._restore(prev); }
redo(){ if(!this.future.length) return; const next = this.future.pop(); this.history.push(next); this._restore(next); }
_restore(json){ const page=this.getCurrent(); page.stage.destroyChildren(); const stage = Konva.Node.create(json, this.getCurrent().stage.container()); this.pages[this.currentPage].stage = stage; this.pages[this.currentPage].layer = stage.findOne('Layer'); }


saveToLocal(key='kai_project'){ const json = { pages: this.pages.map(p => p.stage.toJSON()) }; localStorage.setItem(key, JSON.stringify(json)); }
loadFromLocal(key='kai_project'){ const raw = localStorage.getItem(key); if(!raw) return; const data = JSON.parse(raw); // for simplicity restore first page
if(data.pages && data.pages[0]){ this._restore(data.pages[0]); }
}
}
