// canvasManager.js
// ES module providing CanvasManager class for the app.
// Requires Konva global (loaded in index.html)

export class CanvasManager {
  constructor(containerId, opts = {}) {
    this.containerId = containerId;
    this.A4 = { w: 1123, h: 794 };
    this.pixelRatioExport = opts.pixelRatio || 2;
    this.snapThreshold = opts.snapThreshold || 12;
    this.onHistory = opts.onHistory || (() => {});
    this._clipboard = null;
    this._presets = [];
    this._history = [];
    this._historyPos = -1;
    this._historyThrottle = null;
    this._spacePressed = false;
    this._isPanning = false;
    this._lastPan = null;
    this._minScale = 0.25;
    this._maxScale = 4;
    this._initStage();
    this._initLayers();
    this._initTransformer();
    this._bindStageEvents();
    this._commitHistoryImmediate();
  }

  _initStage() {
    const container = document.getElementById(this.containerId);
    container.style.width = `${this.A4.w}px`;
    container.style.height = `${this.A4.h}px`;

    this.stage = new Konva.Stage({
      container: this.containerId,
      width: this.A4.w,
      height: this.A4.h,
      draggable: false,
    });

    this.containerEl = container.parentElement || container;
  }

  _initLayers() {
    this.bgLayer = new Konva.Layer({ listening: false });
    this.paper = new Konva.Rect({
      x: 0, y: 0, width: this.A4.w, height: this.A4.h, fill: '#ffffff', cornerRadius: 6
    });
    this.bgLayer.add(this.paper);

    this.gridLayer = new Konva.Layer({ listening: false, visible: false });
    this.contentLayer = new Konva.Layer();
    this.guideLayer = new Konva.Layer({ listening: false });

    this.stage.add(this.bgLayer, this.gridLayer, this.contentLayer, this.guideLayer);
    this._buildGrid();
  }

  _initTransformer() {
    this.transformer = new Konva.Transformer({
      rotateAnchorOffset: 20,
      borderDash: [6, 6],
      anchorFill: '#ffffff',
      anchorStroke: '#6f5cff',
      anchorStrokeWidth: 2,
      keepRatio: false,
      enabledAnchors: ['top-left','top-right','bottom-left','bottom-right','middle-left','middle-right','top-center','bottom-center']
    });
    this.contentLayer.add(this.transformer);
  }

  _buildGrid() {
    const spacing = 40;
    this.gridLayer.destroyChildren();
    for (let x = 0; x <= this.A4.w; x += spacing) {
      this.gridLayer.add(new Konva.Line({ points: [x,0,x,this.A4.h], stroke: '#000', opacity: 0.04 }));
    }
    for (let y = 0; y <= this.A4.h; y += spacing) {
      this.gridLayer.add(new Konva.Line({ points: [0,y,this.A4.w,y], stroke: '#000', opacity: 0.04 }));
    }
    this.gridLayer.batchDraw();
  }

  _bindStageEvents() {
    window.addEventListener('resize', () => this.fitToContainer());
    this.fitToContainer();

    this.stage.on('wheel', (e) => this._onWheel(e));

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this._spacePressed) {
        this._spacePressed = true;
        this.stage.container().style.cursor = 'grab';
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); this.fitToContainer(true); }
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) { e.preventDefault(); this._zoomBy(1.15); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); this._zoomBy(1/1.15); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this._spacePressed = false;
        this.stage.container().style.cursor = 'default';
      }
    });

    const container = this.stage.container();
    container.addEventListener('mousedown', (evt) => {
      if (!this._spacePressed) return;
      this._isPanning = true;
      this._lastPan = { x: evt.clientX, y: evt.clientY };
      container.style.cursor = 'grabbing';
    });
    container.addEventListener('mousemove', (evt) => {
      if (!this._isPanning) return;
      const pos = { x: evt.clientX, y: evt.clientY };
      const dx = pos.x - this._lastPan.x;
      const dy = pos.y - this._lastPan.y;
      this.stage.x(this.stage.x() + dx);
      this.stage.y(this.stage.y() + dy);
      this.stage.batchDraw();
      this._lastPan = pos;
    });
    container.addEventListener('mouseup', () => {
      if (this._isPanning) {
        this._isPanning = false;
        container.style.cursor = this._spacePressed ? 'grab' : 'default';
      }
    });
    container.addEventListener('mouseleave', () => {
      if (this._isPanning) {
        this._isPanning = false;
        container.style.cursor = this._spacePressed ? 'grab' : 'default';
      }
    });

    this.stage.on('click tap', (e) => {
      if (e.target === this.stage || e.target === this.paper) {
        this.transformer.nodes([]);
        this._emitSelectionChange(null);
      }
    });
  }

  _onWheel(e) {
    const evt = e.evt;
    const isZoom = evt.ctrlKey || evt.metaKey;
    if (!isZoom) return;
    evt.preventDefault();
    const oldScale = this.stage.scaleX() || 1;
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;
    const scaleBy = 1.06;
    const direction = evt.deltaY > 0 ? -1 : 1;
    let newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    newScale = Math.max(this._minScale, Math.min(this._maxScale, newScale));
    const mousePointTo = {
      x: (pointer.x - this.stage.x()) / oldScale,
      y: (pointer.y - this.stage.y()) / oldScale
    };
    this.stage.scale({ x: newScale, y: newScale });
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale
    };
    this.stage.position(newPos);
    this.stage.batchDraw();
    window.dispatchEvent(new CustomEvent('stage:scale', { detail: { scale: newScale } }));
  }

  _zoomBy(factor) {
    const oldScale = this.stage.scaleX() || 1;
    let newScale = oldScale * factor;
    newScale = Math.max(this._minScale, Math.min(this._maxScale, newScale));
    const containerBox = this.containerEl.getBoundingClientRect();
    const center = { x: containerBox.width / 2, y: containerBox.height / 2 };
    const mousePointTo = { x: (center.x - this.stage.x()) / oldScale, y: (center.y - this.stage.y()) / oldScale };
    this.stage.scale({ x: newScale, y: newScale });
    this.stage.position({ x: center.x - mousePointTo.x * newScale, y: center.y - mousePointTo.y * newScale });
    this.stage.batchDraw();
    window.dispatchEvent(new CustomEvent('stage:scale', { detail: { scale: newScale } }));
  }

  fitToContainer(instant = false) {
    const parent = this.containerEl;
    const pw = parent.clientWidth - 48;
    const ph = parent.clientHeight - 120;
    const scale = Math.min(pw / this.A4.w, ph / this.A4.h, 1);
    this.stage.width(this.A4.w * scale);
    this.stage.height(this.A4.h * scale);
    this.stage.scale({ x: scale, y: scale });
    const left = Math.max((parent.clientWidth - (this.A4.w * scale)) / 2, 0);
    const top = 20;
    this.stage.position({ x: left, y: top });
    this.stage.batchDraw();
    window.dispatchEvent(new CustomEvent('stage:scale', { detail: { scale } }));
  }

  addText(opts = {}) {
    const { text = 'Double-click to edit', fontFamily = 'Poppins', fontSize = 36, fill = '#111' } = opts;
    const txt = new Konva.Text({
      x: this.A4.w / 2 - 200,
      y: this.A4.h / 2 - Math.round(fontSize / 2),
      text,
      fontFamily,
      fontSize,
      fill,
      draggable: true,
      name: 'object'
    });
    this._setupObject(txt, true);
    this.contentLayer.add(txt);
    this.contentLayer.draw();
    this._commitHistory();
    return txt;
  }

  addImageFromFile(file) {
    return this._fileToDataURL(file).then(url => this.addImageFromURL(url));
  }

  addImageFromURL(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const maxSide = 360;
        const ratio = Math.min(maxSide / img.width, maxSide / img.height, 1);
        const kimg = new Konva.Image({
          image: img,
          x: this.A4.w / 2 - (img.width * ratio) / 2,
          y: this.A4.h / 2 - (img.height * ratio) / 2,
          width: img.width * ratio,
          height: img.height * ratio,
          draggable: true,
          name: 'object',
        });
        kimg.shadowColor('#fff'); kimg.shadowBlur(12); kimg.shadowOpacity(1);
        kimg.stroke('#fff'); kimg.strokeWidth(6);
        this._setupObject(kimg, false);
        this.contentLayer.add(kimg);
        this.contentLayer.draw();
        this._commitHistory();
        resolve(kimg);
      };
      img.src = url;
    });
  }

  _fileToDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = (e) => res(e.target.result);
      r.onerror = (e) => rej(e);
      r.readAsDataURL(file);
    });
  }

  _setupObject(node, isText = false) {
    node.setAttr('selectable', true);
    node.on('mousedown touchstart', (e) => e.cancelBubble = true);
    node.on('dragmove', () => this._onNodeDragMove(node));
    node.on('dragend', () => {
      this.tryInsertIntoPreset(node);
      this._commitHistory();
    });
    node.on('transformend', () => this._commitHistory());
    node.on('click tap', (e) => {
      this.transformer.nodes([node]);
      this._emitSelectionChange(node);
      e.cancelBubble = true;
    });
    this.contentLayer.draw();
  }

  _onNodeDragMove(node) {
    this._clearGuides();
    const box = node.getClientRect();
    const center = { x: box.x + box.width/2, y: box.y + box.height/2 };
    const targets = [
      { x: this.A4.w/2, y: null },
      { x: 0, y: null },
      { x: this.A4.w, y: null },
      { x: null, y: this.A4.h/2 },
      { x: null, y: 0 },
      { x: null, y: this.A4.h }
    ];
    this.contentLayer.find('.object').each(o => {
      if (o === node) return;
      const b = o.getClientRect();
      targets.push({ x: b.x + b.width/2, y: null });
      targets.push({ x: null, y: b.y + b.height/2 });
    });
    const guides = [];
    targets.forEach(t => {
      if (t.x !== null && Math.abs(center.x - t.x) < this.snapThreshold) {
        const dx = t.x - center.x;
        node.x(node.x() + dx);
        guides.push(new Konva.Line({ points: [t.x, 0, t.x, this.A4.h], stroke: '#00c2a8', dash: [6,6], strokeWidth: 1 }));
      }
      if (t.y !== null && Math.abs(center.y - t.y) < this.snapThreshold) {
        const dy = t.y - center.y;
        node.y(node.y() + dy);
        guides.push(new Konva.Line({ points: [0, t.y, this.A4.w, t.y], stroke: '#00c2a8', dash: [6,6], strokeWidth: 1 }));
      }
    });
    guides.forEach(g => this.guideLayer.add(g));
    this.guideLayer.batchDraw();
  }

  _clearGuides() {
    this.guideLayer.destroyChildren();
    this.guideLayer.draw();
  }

  addPreset(type = 'grid') {
    if (type === 'grid') return this._presetGrid();
    if (type === 'circles') return this._presetCircles();
    if (type === 'labels') return this._presetLabels();
    if (type === 'mixed') return this._presetMixed();
    if (type === 'tag') return this._presetTagShapes();
    return this._createRectPreset(200, 120, 300, 220);
  }

  _createRectPreset(x, y, w, h) {
    const group = new Konva.Group({ x, y, width: w, height: h, name: 'preset-group' });
    const outline = new Konva.Rect({ x: 0, y: 0, width: w, height: h, stroke: '#9ca3af', dash: [6,6], strokeWidth: 1, listening:false });
    group.add(outline);
    group.clipFunc(function(ctx) { ctx.rect(0, 0, w, h); });
    group.setAttr('presetType', 'rect');
    group.setAttr('presetBounds', { w, h });
    this.contentLayer.add(group);
    this._presets.push(group);
    this.contentLayer.draw();
    this._commitHistory();
    return group;
  }

  _createCirclePreset(cx, cy, r) {
    const group = new Konva.Group({ x: cx - r, y: cy - r, width: r*2, height: r*2, name: 'preset-group' });
    const outline = new Konva.Circle({ x: r, y: r, radius: r, stroke: '#9ca3af', dash: [6,6], strokeWidth: 1, listening:false });
    group.add(outline);
    group.clipFunc(function(ctx) {
      ctx.beginPath();
      ctx.arc(r, r, r, 0, Math.PI * 2, false);
      ctx.closePath();
    });
    group.setAttr('presetType', 'circle');
    group.setAttr('presetBounds', { r });
    this.contentLayer.add(group);
    this._presets.push(group);
    this.contentLayer.draw();
    this._commitHistory();
    return group;
  }

  _presetGrid() {
    const cols = 4, rows = 3, pad = 18;
    const cellW = (this.A4.w - pad*(cols+1)) / cols;
    const cellH = (this.A4.h - pad*(rows+1)) / rows;
    const created = [];
    for (let r=0; r<rows; r++) {
      for (let c=0; c<cols; c++) {
        const x = pad + c*(cellW + pad);
        const y = pad + r*(cellH + pad);
        created.push(this._createRectPreset(x, y, cellW, cellH));
      }
    }
    return created;
  }

  _presetCircles() {
    const count = 6;
    const created = [];
    for (let i=0;i<count;i++){
      const cx = 140 + i * 160;
      const cy = this.A4.h/2;
      const r = 70;
      created.push(this._createCirclePreset(cx, cy, r));
    }
    return created;
  }

  _presetLabels() {
    const rows = 4, pad = 24;
    const cellW = this.A4.w - pad*2;
    const cellH = (this.A4.h - pad*(rows+1)) / rows;
    const created = [];
    for (let r=0;r<rows;r++){
      const x = pad, y = pad + r*(cellH + pad);
      created.push(this._createRectPreset(x, y, cellW, cellH));
    }
    return created;
  }

  _presetMixed() {
    const a = this._createRectPreset(80, 60, 320, 220);
    const b = this._createRectPreset(460, 80, 260, 260);
    const c = this._createCirclePreset(860, 220, 100);
    return [a,b,c];
  }

  _presetTagShapes() {
    const created = [];
    const w = 180, h = 120;
    let startX = 80, startY = 80;
    for (let i=0;i<4;i++){
      created.push(this._createRectPreset(startX + i*200, startY, w, h));
    }
    return created;
  }

  tryInsertIntoPreset(node) {
    for (const group of this._presets.slice().reverse()) {
      if (!group || group._destroyed) continue;
      const presetAbs = group.getClientRect({ relativeTo: this.stage });
      const nodeAbs = node.getClientRect({ relativeTo: this.stage });
      if (Konva.Util.haveIntersection(presetAbs, nodeAbs)) {
        const nodeAbsPos = node.getAbsolutePosition();
        const groupAbsPos = group.getAbsolutePosition();
        node.moveTo(group);
        node.position({ x: nodeAbsPos.x - groupAbsPos.x, y: nodeAbsPos.y - groupAbsPos.y });
        if (group.getAttr('presetType') === 'rect') {
          const { w, h } = group.getAttr('presetBounds');
          this._fitNodeToBounds(node, w, h);
        } else if (group.getAttr('presetType') === 'circle') {
          const { r } = group.getAttr('presetBounds');
          this._fitNodeToBounds(node, r*2, r*2);
        }
        node.draggable(true);
        node.setAttr('selectable', true);
        this.transformer.nodes([node]);
        this.contentLayer.draw();
        this._commitHistory();
        return true;
      }
    }
    return false;
  }

  _fitNodeToBounds(node, w, h) {
    const naturalW = node.width();
    const naturalH = node.height();
    if (!naturalW || !naturalH) return;
    const scale = Math.max(w / naturalW, h / naturalH);
    node.width(naturalW * scale);
    node.height(naturalH * scale);
    node.x((w - node.width()) / 2);
    node.y((h - node.height()) / 2);
  }

  getSelectedNodes() { return this.transformer.nodes() || []; }
  deleteSelected() { const nodes = this.getSelectedNodes(); nodes.forEach(n => n.destroy()); this.transformer.nodes([]); this.contentLayer.draw(); this._commitHistory(); }
  duplicateSelected() { const nodes = this.getSelectedNodes(); const clones=[]; nodes.forEach(n=>{const clone=n.clone({x:n.x()+12,y:n.y()+12}); clone.setAttr&&clone.setAttr('selectable',true); this._setupObject(clone, clone.getClassName()==='Text'); n.getParent().add(clone); clones.push(clone);} ); this.contentLayer.draw(); this._commitHistory(); return clones; }
  copySelected() { const nodes = this.getSelectedNodes(); if(!nodes||nodes.length===0) return null; this._clipboard = nodes.map(n=>n.toJSON()); return this._clipboard; }
  pasteClipboard() { if(!this._clipboard) return []; const added=[]; this._clipboard.forEach(j=>{ const node = Konva.Node.create(j); node.x((node.x()||0)+12); node.y((node.y()||0)+12); node.setAttr&&node.setAttr('selectable',true); this.contentLayer.add(node); this._setupObject(node, node.getClassName()==='Text'); added.push(node);} ); this.contentLayer.draw(); this._commitHistory(); return added; }
  groupSelected() { const nodes=this.getSelectedNodes(); if(!nodes||nodes.length<2) return null; const group=new Konva.Group({draggable:true,name:'object',selectable:true}); let minX=Infinity,minY=Infinity; nodes.forEach(n=>{const abs=n.getAbsolutePosition(); minX=Math.min(minX,abs.x); minY=Math.min(minY,abs.y);} ); group.position({x:minX,y:minY}); this.contentLayer.add(group); nodes.forEach(n=>{const abs=n.getAbsolutePosition(); n.moveTo(group); n.position({x:abs.x-minX,y:abs.y-minY});}); this.transformer.nodes([group]); this.contentLayer.draw(); this._commitHistory(); return group; }
  ungroupSelected() { const nodes=this.getSelectedNodes(); nodes.forEach(n=>{ if(n.getClassName()==='Group'){ const children=n.getChildren().toArray(); children.forEach(c=>{ const abs=c.getAbsolutePosition(); c.moveTo(this.contentLayer); c.position({x:abs.x,y:abs.y}); }); n.destroy(); } }); this.contentLayer.draw(); this._commitHistory(); }
  nudgeSelected(dx,dy){ const nodes=this.getSelectedNodes(); nodes.forEach(n=>{ n.x(n.x()+dx); n.y(n.y()+dy); }); this.contentLayer.draw(); this._commitHistory(); }

  toDataURL(pixelRatio=this.pixelRatioExport){ const prev=this.paper.fill(); this.paper.fill('#ffffff'); this.bgLayer.draw(); const url=this.stage.toDataURL({ pixelRatio }); this.paper.fill(prev); this.bgLayer.draw(); return url; }
  async toPDF(){ const { jsPDF } = window.jspdf; const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' }); const img = this.toDataURL(this.pixelRatioExport); const w = pdf.internal.pageSize.getWidth(); const h = pdf.internal.pageSize.getHeight(); pdf.addImage(img,'PNG',0,0,w,h); return pdf; }

  _commitHistory() {
    if (this._historyThrottle) cancelAnimationFrame(this._historyThrottle);
    this._historyThrottle = requestAnimationFrame(() => {
      const snapshot = this.contentLayer.toJSON();
      if (this._historyPos >= 0 && this._history[this._historyPos] === snapshot) return;
      this._history.splice(this._historyPos + 1);
      this._history.push(snapshot);
      this._historyPos = this._history.length - 1;
      this.onHistory(snapshot);
      window.dispatchEvent(new CustomEvent('canvas:history', { detail: { snapshot } }));
    });
  }

  _commitHistoryImmediate() {
    const snapshot = this.contentLayer.toJSON();
    this._history.splice(this._historyPos + 1);
    this._history.push(snapshot);
    this._historyPos = this._history.length - 1;
    this.onHistory(snapshot);
    window.dispatchEvent(new CustomEvent('canvas:history', { detail: { snapshot } }));
  }

  undo() { if (this._historyPos > 0) { this._historyPos--; this._restoreHistoryAt(this._historyPos); } }
  redo() { if (this._historyPos < this._history.length - 1) { this._historyPos++; this._restoreHistoryAt(this._historyPos); } }

  _restoreHistoryAt(pos) {
    const snapshot = this._history[pos];
    if (!snapshot) return;
    try {
      this.contentLayer.destroyChildren();
      const restoredLayer = Konva.Node.create(snapshot);
      const children = restoredLayer.getChildren ? restoredLayer.getChildren().toArray() : [];
      children.forEach(ch=>{
        ch.setAttr && ch.setAttr('selectable', true);
        this._setupObject(ch, ch.getClassName() === 'Text');
        this.contentLayer.add(ch);
      });
      this.contentLayer.add(this.transformer);
      this.contentLayer.draw();
      this.onHistory(snapshot);
      window.dispatchEvent(new CustomEvent('canvas:history', { detail: { snapshot } }));
    } catch (e) {
      console.warn('restore history error', e);
    }
  }

  _emitSelectionChange(node) {
    window.dispatchEvent(new CustomEvent('canvas:selection', { detail: { node } }));
  }
}
