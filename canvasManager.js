// canvasManager.js
// ES module: export class CanvasManager
// Requires Konva global

export class CanvasManager {
  constructor(containerId, opts = {}) {
    this.containerId = containerId;
    this.A4 = { w: 1123, h: 794 };
    this.pixelRatio = opts.pixelRatio || 2;
    this.snapThreshold = opts.snapThreshold || 12;
    this.onHistory = opts.onHistory || (() => {});
    this._presets = [];
    this._clipboard = null;
    this._history = [];
    this._historyPos = -1;
    this._historyThrottle = null;
    this._initStage();
    this._initLayers();
    this._initTransformer();
    this._bindEvents();
    // initial history snapshot
    this._commitHistoryImmediate();
  }

  _initStage() {
    const container = document.getElementById(this.containerId);
    container.style.width = `${this.A4.w}px`;
    container.style.height = `${this.A4.h}px`;
    this.stage = new Konva.Stage({ container: this.containerId, width: this.A4.w, height: this.A4.h });
    this.containerEl = container.parentElement || container;
  }

  _initLayers() {
    this.bgLayer = new Konva.Layer({ listening: false });
    this.paper = new Konva.Rect({ x: 0, y: 0, width: this.A4.w, height: this.A4.h, fill: '#fff' });
    this.bgLayer.add(this.paper);

    this.gridLayer = new Konva.Layer({ listening: false, visible: false });
    this.contentLayer = new Konva.Layer();
    this.guideLayer = new Konva.Layer({ listening: false });

    this.stage.add(this.bgLayer, this.gridLayer, this.contentLayer, this.guideLayer);

    // build grid lines (hidden by default)
    const spacing = 40;
    for (let x = 0; x <= this.A4.w; x += spacing) {
      this.gridLayer.add(new Konva.Line({ points: [x,0,x,this.A4.h], stroke: '#000', opacity: 0.04 }));
    }
    for (let y = 0; y <= this.A4.h; y += spacing) {
      this.gridLayer.add(new Konva.Line({ points: [0,y,this.A4.w,y], stroke: '#000', opacity: 0.04 }));
    }

    this.stage.draw();
    this.fitToContainer();
    window.addEventListener('resize', () => this.fitToContainer());
  }

  _initTransformer() {
    this.tr = new Konva.Transformer({
      keepRatio: false,
      anchorFill: '#fff',
      anchorStroke: '#6f5cff',
      borderDash: [6,6],
      enabledAnchors: ['top-left','top-right','bottom-left','bottom-right','middle-left','middle-right','top-center','bottom-center']
    });
    this.contentLayer.add(this.tr);
  }

  _bindEvents() {
    // deselect when clicking empty space
    this.stage.on('click tap', (e) => {
      if (e.target === this.stage || e.target === this.paper) {
        this.tr.nodes([]);
        window.dispatchEvent(new CustomEvent('canvas:selection', { detail: { node: null } }));
      }
    });

    // wheel zoom (require ctrl/meta)
    this.stage.on('wheel', (e) => {
      const evt = e.evt;
      if (!evt.ctrlKey && !evt.metaKey) return;
      evt.preventDefault();
      const oldScale = this.stage.scaleX() || 1;
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;
      const scaleBy = 1.06;
      const direction = evt.deltaY > 0 ? -1 : 1;
      let newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
      newScale = Math.max(0.25, Math.min(4, newScale));
      const mousePointTo = { x: (pointer.x - this.stage.x()) / oldScale, y: (pointer.y - this.stage.y()) / oldScale };
      this.stage.scale({ x: newScale, y: newScale });
      const newPos = { x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale };
      this.stage.position(newPos);
      this.stage.batchDraw();
      window.dispatchEvent(new CustomEvent('stage:scale', { detail: { scale: newScale } }));
    });

    // pan with space + drag
    let spaceDown = false;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { spaceDown = true; this.stage.container().style.cursor = 'grab'; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { spaceDown = false; this.stage.container().style.cursor = 'default'; }
    });
    const container = this.stage.container();
    let isPanning = false, last = null;
    container.addEventListener('mousedown', (ev) => {
      if (!spaceDown) return;
      isPanning = true; last = { x: ev.clientX, y: ev.clientY }; container.style.cursor = 'grabbing';
    });
    container.addEventListener('mousemove', (ev) => {
      if (!isPanning) return;
      const dx = ev.clientX - last.x; const dy = ev.clientY - last.y;
      this.stage.x(this.stage.x() + dx); this.stage.y(this.stage.y() + dy);
      this.stage.batchDraw(); last = { x: ev.clientX, y: ev.clientY };
    });
    container.addEventListener('mouseup', () => { if (isPanning) { isPanning = false; container.style.cursor = spaceDown ? 'grab' : 'default'; } });
    container.addEventListener('mouseleave', () => { if (isPanning) { isPanning = false; container.style.cursor = spaceDown ? 'grab' : 'default'; } });

    // content interactions: snapping & highlight
    this.contentLayer.on('dragmove', (e) => {
      const node = e.target;
      this._snapGuidesFor(node);
      this._highlightPresetUnder(node);
    });

    this.contentLayer.on('dragend', (e) => {
      const node = e.target;
      this._clearGuides();
      this._clearPresetHighlights();
      this.tryInsertIntoPreset(node);
      this._commitHistory();
    });

    this.contentLayer.on('transformend', () => this._commitHistory());
  }

  /* ---------------- Public API ---------------- */

  fitToContainer() {
    const parent = this.containerEl;
    const pw = parent.clientWidth - 48;
    const ph = parent.clientHeight - 120;
    const scale = Math.min(pw / this.A4.w, ph / this.A4.h, 1);
    this.stage.width(this.A4.w * scale); this.stage.height(this.A4.h * scale);
    this.stage.scale({ x: scale, y: scale });
    const left = Math.max((parent.clientWidth - (this.A4.w * scale)) / 2, 0);
    const top = 20;
    this.stage.position({ x: left, y: top });
    this.stage.batchDraw();
    window.dispatchEvent(new CustomEvent('stage:scale', { detail: { scale } }));
  }

  addText() {
    const txt = new Konva.Text({
      x: this.A4.w/2 - 150, y: this.A4.h/2 - 20, text: 'Double-click to edit',
      fontSize: 36, fontFamily: 'Poppins', fill: '#111', draggable: true, name: 'object'
    });
    this._setupObject(txt, true);
    this.contentLayer.add(txt); this.contentLayer.draw(); this._commitHistory();
    return txt;
  }

  async addImageFromFile(file) {
    const dataUrl = await this._fileToDataURL(file);
    return this.addImageFromURL(dataUrl);
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
          x: this.A4.w/2 - (img.width*ratio)/2,
          y: this.A4.h/2 - (img.height*ratio)/2,
          width: img.width*ratio, height: img.height*ratio,
          draggable: true, name: 'object'
        });
        // sticker halo
        kimg.shadowColor('#fff'); kimg.shadowBlur(12); kimg.shadowOpacity(1);
        kimg.stroke('#fff'); kimg.strokeWidth(6);
        // store original src on node (used by serializer)
        kimg._src = url;
        this._setupObject(kimg, false);
        this.contentLayer.add(kimg);
        this.contentLayer.draw();
        this._commitHistory();
        resolve(kimg);
      };
      img.src = url;
    });
  }

  toggleGrid() { this.gridLayer.visible(!this.gridLayer.visible()); this.gridLayer.draw(); }

  addPreset(type = 'grid') {
    if (type === 'grid') return this._presetGrid();
    if (type === 'circles') return this._presetCircles();
    if (type === 'labels') return this._presetLabels();
    if (type === 'mixed') return this._presetMixed();
    if (type === 'strips') return this._presetStrips();
    return this._createRectPreset(200, 120, 300, 220);
  }

  toDataURL(pixelRatio = this.pixelRatio) {
    const prev = this.paper.fill();
    this.paper.fill('#ffffff');
    this.bgLayer.draw();
    const url = this.stage.toDataURL({ pixelRatio });
    this.paper.fill(prev);
    this.bgLayer.draw();
    return url;
  }

  async toPDF() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    const dataUrl = this.toDataURL(this.pixelRatio);
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH);
    return pdf;
  }

  /* ---------------- Preset templates ---------------- */

  _createRectPreset(x, y, w, h) {
    const g = new Konva.Group({ x, y, width: w, height: h, name: 'preset-group' });
    const outline = new Konva.Rect({ x: 0, y: 0, width: w, height: h, stroke: '#94a3b8', strokeWidth: 1, dash: [6,6], listening: false });
    g.add(outline);
    g.clipFunc(function(ctx) { ctx.rect(0,0,w,h); });
    g.setAttr('presetType', 'rect'); g.setAttr('presetBounds', { w, h });
    this.contentLayer.add(g); this._presets.push(g); this.contentLayer.draw();
    this._commitHistory();
    return g;
  }

  _createCirclePreset(cx, cy, r) {
    const g = new Konva.Group({ x: cx - r, y: cy - r, width: r*2, height: r*2, name: 'preset-group' });
    const outline = new Konva.Circle({ x: r, y: r, radius: r, stroke: '#94a3b8', strokeWidth: 1, dash: [6,6], listening: false });
    g.add(outline);
    g.clipFunc(function(ctx){ ctx.beginPath(); ctx.arc(r,r,r,0,Math.PI*2); ctx.closePath(); });
    g.setAttr('presetType', 'circle'); g.setAttr('presetBounds', { r });
    this.contentLayer.add(g); this._presets.push(g); this.contentLayer.draw();
    this._commitHistory();
    return g;
  }

  _presetGrid() {
    const cols=4, rows=3, pad=18;
    const w=(this.A4.w - pad*(cols+1))/cols, h=(this.A4.h - pad*(rows+1))/rows;
    const created = [];
    for (let r=0;r<rows;r++){ for (let c=0;c<cols;c++){
      const x = pad + c*(w+pad), y = pad + r*(h+pad);
      created.push(this._createRectPreset(x,y,w,h));
    }}
    return created;
  }

  _presetCircles() {
    const created=[];
    for (let i=0;i<6;i++){ const cx = 140 + i*160, cy = this.A4.h/2, r=70; created.push(this._createCirclePreset(cx,cy,r)); }
    return created;
  }

  _presetLabels() {
    const created=[]; const rows=4, pad=24; const w=this.A4.w - pad*2; const h=(this.A4.h - pad*(rows+1))/rows;
    for (let r=0;r<rows;r++){ const x=pad, y=pad + r*(h+pad); created.push(this._createRectPreset(x,y,w,h)); }
    return created;
  }

  _presetMixed() {
    return [ this._createRectPreset(80,60,320,220), this._createRectPreset(460,80,260,260), this._createCirclePreset(860,220,100) ];
  }

  _presetStrips() {
    const created=[]; let y=40; for (let i=0;i<6;i++){ created.push(this._createRectPreset(40,y,240,90)); y += 90 + 18; } return created;
  }

  /* ---------------- Snap-insertion (safe) ---------------- */

  tryInsertIntoPreset(node) {
    for (const preset of this._presets.slice().reverse()) {
      if (!preset || preset._destroyed) continue;
      const presetRect = preset.getClientRect({ relativeTo: this.stage });
      const nodeRect = node.getClientRect({ relativeTo: this.stage });
      if (Konva.Util.haveIntersection(presetRect, nodeRect)) {
        const nodeAbs = node.getAbsolutePosition();
        const presetAbs = preset.getAbsolutePosition();
        node.moveTo(preset);
        node.position({ x: nodeAbs.x - presetAbs.x, y: nodeAbs.y - presetAbs.y });
        // fit cover
        if (preset.getAttr('presetType') === 'rect') {
          const { w,h } = preset.getAttr('presetBounds');
          this._fitNodeToBounds(node,w,h);
        } else {
          const { r } = preset.getAttr('presetBounds');
          this._fitNodeToBounds(node, r*2, r*2);
        }
        node.draggable(true); node.setAttr('selectable', true);
        this.tr.nodes([node]);
        this.contentLayer.draw();
        this._commitHistory();
        return true;
      }
    }
    return false;
  }

  _fitNodeToBounds(node, w, h) {
    const nw = node.width(); const nh = node.height();
    if (!nw || !nh) return;
    const scale = Math.max(w/nw, h/nh);
    node.width(nw * scale); node.height(nh * scale);
    node.x((w - node.width())/2); node.y((h - node.height())/2);
  }

  /* ---------------- snapping guides & highlight ---------------- */

  _snapGuidesFor(node) {
    this._clearGuides();
    const rect = node.getClientRect();
    const center = { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
    const targets = [{x:this.A4.w/2,y:null},{x:0,y:null},{x:this.A4.w,y:null},{x:null,y:this.A4.h/2},{x:null,y:0},{x:null,y:this.A4.h}];
    this.contentLayer.find('.object').each(o => {
      if (o === node) return;
      const b = o.getClientRect(); targets.push({x:b.x + b.width/2, y:null}); targets.push({x:null, y:b.y + b.height/2});
    });
    const guides=[];
    targets.forEach(t => {
      if (t.x !== null && Math.abs(center.x - t.x) < this.snapThreshold) {
        const dx = t.x - center.x; node.x(node.x() + dx);
        guides.push(new Konva.Line({ points: [t.x,0,t.x,this.A4.h], stroke: '#00c2a8', dash:[6,6], strokeWidth:1 }));
      }
      if (t.y !== null && Math.abs(center.y - t.y) < this.snapThreshold) {
        const dy = t.y - center.y; node.y(node.y() + dy);
        guides.push(new Konva.Line({ points: [0,t.y,this.A4.w,t.y], stroke: '#00c2a8', dash:[6,6], strokeWidth:1 }));
      }
    });
    guides.forEach(g => this.guideLayer.add(g));
    this.guideLayer.batchDraw();
  }

  _clearGuides() { this.guideLayer.destroyChildren(); this.guideLayer.draw(); }

  _highlightPresetUnder(node) {
    this._clearPresetHighlights();
    for (const preset of this._presets) {
      const presetRect = preset.getClientRect({ relativeTo: this.stage });
      const nodeRect = node.getClientRect({ relativeTo: this.stage });
      if (Konva.Util.haveIntersection(presetRect, nodeRect)) {
        const outline = preset.findOne('.preset-highlight');
        if (!outline) {
          const w = preset.getAttr('presetBounds')?.w || (preset.getAttr('presetBounds')?.r*2);
          const h = preset.getAttr('presetBounds')?.h || (preset.getAttr('presetBounds')?.r*2);
          const highlight = preset.findOne('Rect, Circle') ? null : null;
        }
        // simply change stroke on group's first child (outline)
        const first = preset.getChildren()[0];
        if (first) first.stroke('#00c2a8');
        this.contentLayer.draw();
        return;
      }
    }
  }

  _clearPresetHighlights() {
    for (const p of this._presets) {
      const first = p.getChildren()[0];
      if (first) first.stroke('#94a3b8');
    }
    this.contentLayer.draw();
  }

  /* ---------------- selection / transform helpers ---------------- */

  _setupObject(node, isText = false) {
    node.setAttr('selectable', true);
    node.on('click tap', (e) => {
      this.tr.nodes([node]);
      window.dispatchEvent(new CustomEvent('canvas:selection', { detail: { node } }));
      e.cancelBubble = true;
    });
    node.on('dragstart', () => this._clearGuides());
    node.on('dragmove', () => {/* handled above via contentLayer listener */});
    node.on('dragend', () => {/* handled above */});
    node.on('transformend', () => this._commitHistory());
    if (isText) {
      node.on('dblclick dbltap', () => {
        // inline edit using prompt for simplicity (safe for GH Pages)
        const val = prompt('Edit text', node.text());
        if (val !== null) { node.text(val); this.contentLayer.draw(); this._commitHistory(); }
      });
    }
  }

  getSelectedNodes() { return this.tr.nodes() || []; }

  deleteSelected() { const nodes = this.getSelectedNodes(); nodes.forEach(n => n.destroy()); this.tr.nodes([]); this.contentLayer.draw(); this._commitHistory(); }

  duplicateSelected() {
    const nodes = this.getSelectedNodes(); const clones = [];
    nodes.forEach(n => {
      const c = n.clone({ x: n.x() + 12, y: n.y() + 12 });
      c.setAttr && c.setAttr('selectable', true);
      // add to same parent
      n.getParent().add(c);
      this._setupObject(c, c.getClassName() === 'Text');
      clones.push(c);
    });
    this.contentLayer.draw(); this._commitHistory(); return clones;
  }

  copySelected() { const nodes = this.getSelectedNodes(); if (!nodes.length) return; this._clipboard = nodes.map(n => this._serializeNode(n)); }

  pasteClipboard() {
    if (!this._clipboard) return [];
    const added = [];
    this._clipboard.forEach(serial => {
      const node = this._createNodeFromSerialized(serial, true);
      this.contentLayer.add(node);
      added.push(node);
    });
    this.contentLayer.draw(); this._commitHistory(); return added;
  }

  groupSelected() {
    const nodes = this.getSelectedNodes(); if (!nodes.length) return null;
    const group = new Konva.Group({ draggable: true, name: 'object' });
    let minX = Infinity, minY = Infinity;
    nodes.forEach(n => { const abs = n.getAbsolutePosition(); minX = Math.min(minX, abs.x); minY = Math.min(minY, abs.y); });
    group.position({ x: minX, y: minY });
    this.contentLayer.add(group);
    nodes.forEach(n => {
      const abs = n.getAbsolutePosition();
      n.moveTo(group);
      n.position({ x: abs.x - minX, y: abs.y - minY });
    });
    this.tr.nodes([group]); this.contentLayer.draw(); this._commitHistory(); return group;
  }

  ungroupSelected() {
    const nodes = this.getSelectedNodes();
    nodes.forEach(n => {
      if (n.getClassName() === 'Group') {
        const children = n.getChildren().toArray();
        children.forEach(c => {
          const abs = c.getAbsolutePosition();
          c.moveTo(this.contentLayer);
          c.position({ x: abs.x, y: abs.y });
        });
        n.destroy();
      }
    });
    this.contentLayer.draw(); this._commitHistory();
  }

  nudgeSelected(dx, dy) { const nodes=this.getSelectedNodes(); nodes.forEach(n=>{n.x(n.x()+dx); n.y(n.y()+dy);} ); this.contentLayer.draw(); this._commitHistory(); }

  /* ---------------- serialization for history (handles images) ---------------- */

  _serializeNode(node) {
    const className = node.getClassName();
    const attrs = Object.assign({}, node.getAttrs());
    // remove circular / functions
    delete attrs.listening; delete attrs.id; delete attrs._id;
    if (className === 'Image') {
      // ensure we have a src (we store Image src on node._src)
      attrs._src = node._src || (node.image() && node.image().src) || null;
      // width/height filled in attrs already
    }
    return { className, attrs };
  }

  _createNodeFromSerialized(serial, offset=false) {
    const { className, attrs } = serial;
    let node;
    if (className === 'Text') {
      node = new Konva.Text(attrs);
      this._setupObject(node, true);
    } else if (className === 'Rect') {
      node = new Konva.Rect(attrs);
      this._setupObject(node, false);
    } else if (className === 'Circle') {
      node = new Konva.Circle(attrs);
      this._setupObject(node, false);
    } else if (className === 'Group') {
      node = new Konva.Group(attrs);
      // recursively create children if present
      if (attrs.children) {
        (attrs.children).forEach(c => {
          const child = this._createNodeFromSerialized(c, false);
          node.add(child);
        });
      }
      this._setupObject(node, false);
    } else if (className === 'Image') {
      node = new Konva.Image({ x: attrs.x, y: attrs.y, width: attrs.width, height: attrs.height, draggable: true, name: attrs.name });
      // load image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { node.image(img); this.contentLayer.draw(); };
      img.src = attrs._src || '';
      node._src = attrs._src || '';
      this._setupObject(node, false);
    } else {
      // fallback: attempt generic create
      try { node = Konva.Node.create({ attrs: attrs, className: className }); } catch(e) { console.warn('unknown class create', className, e); node = new Konva.Group(attrs); }
      this._setupObject(node, false);
    }
    if (offset) { node.x((node.x() || 0) + 12); node.y((node.y() || 0) + 12); }
    return node;
  }

  _serializeContent() {
    const arr = [];
    this.contentLayer.getChildren().toArray().forEach(child => {
      // skip transformer
      if (child === this.tr) return;
      arr.push(this._serializeNode(child));
    });
    return JSON.stringify(arr);
  }

  async _restoreContent(serialized) {
    // serialized is JSON string produced by _serializeContent
    try {
      const arr = JSON.parse(serialized);
      this.contentLayer.destroyChildren();
      for (const s of arr) {
        const node = this._createNodeFromSerialized(s, false);
        this.contentLayer.add(node);
      }
      // re-add transformer
      this.contentLayer.add(this.tr);
      this.contentLayer.draw();
    } catch (e) { console.warn('restore failed', e); }
  }

  /* ---------------- history management ---------------- */

  _commitHistory() {
    if (this._historyThrottle) cancelAnimationFrame(this._historyThrottle);
    this._historyThrottle = requestAnimationFrame(() => {
      const snap = this._serializeContent();
      if (this._historyPos >= 0 && this._history[this._historyPos] === snap) return;
      this._history.splice(this._historyPos + 1);
      this._history.push(snap);
      this._historyPos = this._history.length - 1;
      this.onHistory(snap);
      window.dispatchEvent(new CustomEvent('canvas:history', { detail: { snapshot: snap } }));
    });
  }

  _commitHistoryImmediate() {
    const snap = this._serializeContent();
    this._history.splice(this._historyPos + 1);
    this._history.push(snap);
    this._historyPos = this._history.length - 1;
    this.onHistory(snap);
    window.dispatchEvent(new CustomEvent('canvas:history', { detail: { snapshot: snap } }));
  }

  async undo() {
    if (this._historyPos <= 0) return;
    this._historyPos--;
    await this._restoreContent(this._history[this._historyPos]);
    this.onHistory(this._history[this._historyPos]);
  }

  async redo() {
    if (this._historyPos >= this._history.length - 1) return;
    this._historyPos++;
    await this._restoreContent(this._history[this._historyPos]);
    this.onHistory(this._history[this._historyPos]);
  }

  /* ---------------- helpers ---------------- */

  _fileToDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = (e) => res(e.target.result);
      r.onerror = (e) => rej(e);
      r.readAsDataURL(file);
    });
  }
}
