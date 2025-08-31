// canvasManager.js
export class CanvasManager {
  constructor(containerId, opts = {}) {
    this.containerId = containerId;
    this.onHistory = opts.onHistory || (() => {});
    this.A4 = { w: 1123, h: 794 };
    this.pixelRatioExport = opts.pixelRatio || 2;
    this.snapThreshold = 12;
    this._initStage();
    this._initLayers();
    this._initTransformer();
    this._initGrid();
    this._bindEvents();
    this._clipboard = null;
    this._presets = []; // store preset groups
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
    this.bgLayer = new Konva.Layer();
    this.paper = new Konva.Rect({
      x: 0, y: 0, width: this.A4.w, height: this.A4.h, fill: '#ffffff', cornerRadius: 6,
      shadowColor: 'rgba(3,6,23,0.12)', shadowBlur: 22
    });
    this.bgLayer.add(this.paper);
    this.stage.add(this.bgLayer);
  }

  _initLayers() {
    this.gridLayer = new Konva.Layer({ listening: false, visible: false });
    this.contentLayer = new Konva.Layer();
    this.guideLayer = new Konva.Layer({ listening: false });
    this.stage.add(this.gridLayer, this.contentLayer, this.guideLayer);
  }

  _initTransformer() {
    this.transformer = new Konva.Transformer({
      rotateAnchorOffset: 20,
      borderDash: [6, 6],
      anchorFill: '#fff',
      anchorStroke: '#6f5cff',
      anchorStrokeWidth: 2,
      enabledAnchors: ['top-left','top-right','bottom-left','bottom-right','middle-left','middle-right','top-center','bottom-center'],
      keepRatio: false,
    });
    this.contentLayer.add(this.transformer);
  }

  _initGrid() {
    const spacing = 40;
    for (let x = 0; x <= this.A4.w; x += spacing) {
      this.gridLayer.add(new Konva.Line({ points: [x,0,x,this.A4.h], stroke: '#111', opacity: 0.06 }));
    }
    for (let y = 0; y <= this.A4.h; y += spacing) {
      this.gridLayer.add(new Konva.Line({ points: [0,y,this.A4.w,y], stroke: '#111', opacity: 0.06 }));
    }
    this.gridLayer.add(new Konva.Line({ points: [this.A4.w/2,0,this.A4.w/2,this.A4.h], stroke: '#6f5cff', dash:[6,6], opacity:0.15 }));
    this.gridLayer.add(new Konva.Line({ points: [0,this.A4.h/2,this.A4.w,this.A4.h/2], stroke: '#6f5cff', dash:[6,6], opacity:0.15 }));
  }

  _bindEvents() {
    // clicking empty area deselects
    this.stage.on('click tap', (e) => {
      if (e.target === this.stage || e.target === this.paper) {
        this.transformer.nodes([]);
        this._hideTextToolbar();
      }
    });

    // content interactions
    this.contentLayer.on('click tap', (e) => {
      const targ = e.target;
      if (targ && targ.getAttr && targ.getAttr('selectable')) {
        this.transformer.nodes([targ]);
      } else {
        this.transformer.nodes([]);
      }
    });

    this.contentLayer.on('dragmove', (e) => {
      this._snapNode(e.target);
    });

    this.contentLayer.on('dragend transformend', (e) => {
      this._clearGuides();
      this._commitHistory();
    });

    // wheel zoom
    this.stage.on('wheel', (e) => this._handleWheel(e));
  }

  toggleGrid() {
    this.gridLayer.visible(!this.gridLayer.visible());
    this.gridLayer.draw();
  }

  fitToContainer() {
    const parent = document.getElementById(this.containerId).parentElement;
    const pw = parent.clientWidth - 48;
    const ph = parent.clientHeight - 120;
    const scale = Math.min(pw / this.A4.w, ph / this.A4.h, 1);
    this.stage.width(this.A4.w * scale); this.stage.height(this.A4.h * scale);
    this.stage.scale({ x: scale, y: scale });
    this.stage.position({ x: (parent.clientWidth - this.A4.w * scale) / 2, y: 20 });
    this.stage.batchDraw();
  }

  addText(opts = {}) {
    const { text = 'Double-click to edit', fontFamily = 'Poppins', fontSize = 36, fill = '#111' } = opts;
    const txt = new Konva.Text({
      x: this.A4.w/2 - 200, y: this.A4.h/2 - 24, width: 400,
      text, fontFamily, fontSize, fill, draggable: true, name: 'object', selectable: true
    });
    this._setupObject(txt, true);
    this.contentLayer.add(txt); this.contentLayer.draw();
    this._commitHistory();
    return txt;
  }

  async addImageFromFile(file) {
    const url = await this._fileToDataURL(file);
    return this.addImageFromURL(url);
  }

  addImageFromURL(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(360 / img.width, 360 / img.height, 1);
        const kimg = new Konva.Image({
          image: img,
          x: this.A4.w/2 - (img.width*ratio)/2,
          y: this.A4.h/2 - (img.height*ratio)/2,
          width: img.width*ratio,
          height: img.height*ratio,
          draggable: true,
          name: 'object',
          selectable: true,
        });
        // default sticker halo
        kimg.shadowColor('#fff'); kimg.shadowBlur(14); kimg.shadowOpacity(1);
        kimg.stroke('#fff'); kimg.strokeWidth(6);
        this._setupObject(kimg, false);
        this.contentLayer.add(kimg); this.contentLayer.draw();
        this._commitHistory();
        resolve(kimg);
      };
      img.src = url;
    });
  }

  _setupObject(node, isText = false) {
    node.on('dragmove', () => this._snapNode(node));
    node.on('dragend transformend', () => this._commitHistory());
    node.setAttr('selectable', true);
    // double-click text inline editing: app can attach handler to node externally
  }

  _fileToDataURL(file) {
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = (e) => res(e.target.result);
      r.readAsDataURL(file);
    });
  }

  // snapping & guides (existing logic)
  _snapNode(node) {
    const box = node.getClientRect();
    const center = { x: box.x + box.width/2, y: box.y + box.height/2 };
    const targets = [
      { x: this.A4.w/2, y: null },
      { x: 0, y: null },
      { x: this.A4.w, y: null },
      { x: null, y: this.A4.h/2 },
      { x: null, y: 0 },
      { x: null, y: this.A4.h },
    ];
    this.contentLayer.find('.object').each(o => {
      if (o === node) return;
      const b = o.getClientRect();
      targets.push({ x: b.x + b.width/2, y: null });
      targets.push({ x: null, y: b.y + b.height/2 });
    });
    this._clearGuides();
    const guides = [];
    targets.forEach(t => {
      if (t.x !== null && Math.abs(center.x - t.x) < this.snapThreshold) {
        const dx = t.x - center.x;
        node.x(node.x() + dx);
        guides.push(new Konva.Line({ points: [t.x,0,t.x,this.A4.h], stroke: '#00c2a8', dash: [6,6], strokeWidth: 1 }));
      }
      if (t.y !== null && Math.abs(center.y - t.y) < this.snapThreshold) {
        const dy = t.y - center.y;
        node.y(node.y() + dy);
        guides.push(new Konva.Line({ points: [0,t.y,this.A4.w,t.y], stroke: '#00c2a8', dash: [6,6], strokeWidth: 1 }));
      }
    });
    guides.forEach(g => this.guideLayer.add(g));
    this.guideLayer.batchDraw();
  }

  _clearGuides() { this.guideLayer.destroyChildren(); this.guideLayer.draw(); }

  _handleWheel(e) {
    e.evt.preventDefault();
    const oldScale = this.stage.scaleX();
    const pointer = this.stage.getPointerPosition();
    const mousePointTo = { x: (pointer.x - this.stage.x()) / oldScale, y: (pointer.y - this.stage.y()) / oldScale };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const scaleBy = 1.06;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    this.stage.scale({ x: newScale, y: newScale });
    const newPos = { x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale };
    this.stage.position(newPos);
    this.stage.batchDraw();
    window.dispatchEvent(new CustomEvent('stage:scaled', { detail: { scale: newScale } }));
  }

  // selection helpers
  getSelectedNodes() {
    return this.transformer.nodes() || [];
  }
  deleteSelected() {
    const nodes = this.getSelectedNodes();
    nodes.forEach(n => n.destroy());
    this.transformer.nodes([]);
    this.contentLayer.draw();
    this._commitHistory();
  }
  duplicateSelected() {
    const nodes = this.getSelectedNodes();
    const clones = [];
    nodes.forEach(n => {
      const clone = n.clone({ x: n.x() + 12, y: n.y() + 12 });
      this._setupObject(clone, clone instanceof Konva.Text);
      this.contentLayer.add(clone);
      clones.push(clone);
    });
    this.contentLayer.draw(); this._commitHistory();
    return clones;
  }
  copySelected() {
    const nodes = this.getSelectedNodes();
    if (!nodes.length) return null;
    this._clipboard = nodes.map(n => n.toJSON());
    return this._clipboard;
  }
  pasteClipboard() {
    if (!this._clipboard) return [];
    const added = [];
    this._clipboard.forEach(j => {
      const node = Konva.Node.create(j);
      node.x(node.x() + 12); node.y(node.y() + 12);
      node.setAttr && node.setAttr('selectable', true);
      this._setupObject(node, node.getClassName() === 'Text');
      this.contentLayer.add(node);
      added.push(node);
    });
    this.contentLayer.draw(); this._commitHistory();
    return added;
  }
  groupSelected() {
    const nodes = this.getSelectedNodes();
    if (!nodes.length) return null;
    const group = new Konva.Group({ draggable: true, name: 'object', selectable: true });
    // move nodes to group preserving absolute position
    nodes.forEach(n => {
      const abs = n.getAbsolutePosition();
      n.moveTo(group);
      n.position({ x: abs.x - group.x(), y: abs.y - group.y() });
    });
    this.contentLayer.add(group);
    this.transformer.nodes([group]);
    this.contentLayer.draw(); this._commitHistory();
    return group;
  }
  ungroupSelected() {
    const nodes = this.getSelectedNodes();
    const groups = nodes.filter(n => n.getClassName() === 'Group');
    groups.forEach(g => {
      const children = g.getChildren().toArray();
      children.forEach(c => { c.moveTo(this.contentLayer); });
      g.destroy();
    });
    this.contentLayer.draw(); this._commitHistory();
  }
  nudgeSelected(dx, dy) {
    const nodes = this.getSelectedNodes();
    nodes.forEach(n => { n.x(n.x() + dx); n.y(n.y() + dy); });
    this.contentLayer.draw(); this._commitHistory();
  }

  // Preset creation: dynamic templates. Each preset is a Konva.Group with a clipFunc
  addPreset(type = 'grid') {
    if (type === 'grid') return this._presetGrid();
    if (type === 'circles' || type === 'circles-bundle') return this._presetCircles();
    if (type === 'labels') return this._presetLabels();
    if (type === 'mixed') return this._presetMixed();
    if (type === 'sticker-strips') return this._presetStrips();
    if (type === 'hex-grid') return this._presetHexGrid();
  }

  _createRectPreset(x, y, w, h, opts = {}) {
    // create a group that acts as a container & mask
    const group = new Konva.Group({
      x, y, width: w, height: h, draggable: false, name: 'preset-group'
    });
    // add a visible dashed outline guide
    const outline = new Konva.Rect({
      x: 0, y: 0, width: w, height: h, stroke: '#d1d5db', dash: [6,6], strokeWidth: 1, listening: false, name: 'preset-outline'
    });
    group.add(outline);
    // clipFunc for rect
    group.clipFunc(function(ctx) {
      ctx.rect(0, 0, w, h);
    });
    // add metadata
    group.setAttr('presetType', 'rect');
    group.setAttr('presetBounds', { w, h });
    this.contentLayer.add(group);
    this._presets.push(group);
    return group;
  }

  _createCirclePreset(cx, cy, r, opts = {}) {
    const group = new Konva.Group({
      x: cx - r, y: cy - r, width: r*2, height: r*2, draggable:false, name: 'preset-group'
    });
    const outline = new Konva.Circle({
      x: r, y: r, radius: r, stroke: '#d1d5db', dash: [6,6], strokeWidth: 1, listening:false, name: 'preset-outline'
    });
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
    return group;
  }

  _presetGrid() {
    const cols = 4, rows = 3, pad = 18;
    const cellW = (this.A4.w - pad*(cols+1)) / cols;
    const cellH = (this.A4.h - pad*(rows+1)) / rows;
    const created = [];
    for (let r=0; r<rows; r++){
      for (let c=0; c<cols; c++){
        const x = pad + c*(cellW+pad);
        const y = pad + r*(cellH+pad);
        created.push(this._createRectPreset(x, y, cellW, cellH));
      }
    }
    this.contentLayer.draw();
    this._commitHistory();
    return created;
  }

  _presetCircles() {
    const count = 6;
    const created = [];
    for (let i=0;i<count;i++){
      const cx = 140 + i * 170;
      const cy = this.A4.h/2;
      const r = 70;
      created.push(this._createCirclePreset(cx, cy, r));
    }
    this.contentLayer.draw(); this._commitHistory();
    return created;
  }

  _presetLabels() {
    const cols = 1, rows = 4, pad = 24;
    const cellW = (this.A4.w - pad*2);
    const cellH = (this.A4.h - pad*(rows+1)) / rows;
    const created = [];
    for (let r=0;r<rows;r++){
      const x = pad;
      const y = pad + r*(cellH + pad);
      created.push(this._createRectPreset(x, y, cellW, cellH));
    }
    this.contentLayer.draw(); this._commitHistory();
    return created;
  }

  _presetMixed() {
    // mix: two rectangles and a circle cluster
    const a = this._createRectPreset(80, 60, 320, 220);
    const b = this._createRectPreset(460, 80, 260, 260);
    const c = this._createCirclePreset(860, 220, 100);
    this.contentLayer.draw(); this._commitHistory();
    return [a,b,c];
  }

  _presetStrips() {
    const created = [];
    const w = 240, h = 90;
    let y = 40;
    for (let i=0;i<6;i++){
      created.push(this._createRectPreset(40, y, w, h));
      y += h + 18;
    }
    this.contentLayer.draw(); this._commitHistory();
    return created;
  }

  _presetHexGrid() {
    // simple hex approximations using circles
    const created = [];
    const r = 56;
    let startX = 80, startY = 80;
    for (let row = 0; row < 3; row++){
      for (let col = 0; col < 5; col++){
        const x = startX + col * (r*1.8) + (row%2 ? r*0.9 : 0);
        const y = startY + row * (r * 1.6);
        created.push(this._createCirclePreset(x, y, r));
      }
    }
    this.contentLayer.draw(); this._commitHistory();
    return created;
  }

  // called when an image finishes drag: if intersects a preset, snap into it
  tryInsertIntoPreset(node) {
    for (const p of this._presets) {
      if (!p || p._destroyed) continue;
      const presetRect = p.getClientRect({ relativeTo: this.stage });
      const imgRect = node.getClientRect({ relativeTo: this.stage });
      if (Konva.Util.haveIntersection(presetRect, imgRect)) {
        // move node into group coordinate space and clip
        const group = p;
        // compute node position relative to group
        const absPos = node.getAbsolutePosition();
        const groupAbsPos = group.getAbsolutePosition();
        const relX = absPos.x - groupAbsPos.x;
        const relY = absPos.y - groupAbsPos.y;

        // remove node from contentLayer and add to group
        node.moveTo(group);
        node.position({ x: relX, y: relY });

        // Fit logic: scale node to cover preset (cover behavior)
        if (group.getAttr('presetType') === 'rect') {
          const { w, h } = group.getAttr('presetBounds');
          this._fitNodeToBounds(node, w, h);
        } else if (group.getAttr('presetType') === 'circle') {
          const { r } = group.getAttr('presetBounds');
          this._fitNodeToBounds(node, r*2, r*2);
        }

        // Ensure node remains interactive inside group
        node.draggable(true);
        node.setAttr('selectable', true);
        // bring transformer to target node
        this.transformer.nodes([node]);
        this.contentLayer.draw();
        this._commitHistory();
        return true;
      }
    }
    return false;
  }

  _fitNodeToBounds(node, w, h) {
    // scale node so that it covers the box (cover mode)
    const imgW = node.width();
    const imgH = node.height();
    const scale = Math.max(w / imgW, h / imgH);
    node.width(imgW * scale);
    node.height(imgH * scale);
    // If node had offset or rotation, leave as-is. Reset position so top-left matches
    node.x(0);
    node.y(0);
  }

  // Export helpers
  toDataURL(pixelRatio = this.pixelRatioExport) {
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
    const dataUrl = this.toDataURL(this.pixelRatioExport);
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH);
    return pdf;
  }

  serialize() {
    return this.stage.toJSON();
  }

  loadFromJSON(json) {
    try {
      const restored = Konva.Node.create(json, this.stage);
      // Replace content layer children with restored stage's content layer (best effort)
      // We'll clear current contentLayer and add restored children except bgLayer
      this.contentLayer.destroyChildren();
      // restored is a Group containing layers; find a content-like layer (attempt)
      const layers = restored.find('Layer');
      let restoredContent = null;
      for (const L of layers) {
        if (L !== null && L.getChildren && L.getChildren().length) {
          restoredContent = L;
          break;
        }
      }
      if (restoredContent) {
        restoredContent.getChildren().each(ch => {
          ch.setAttr && ch.setAttr('selectable', true);
          this._setupObject(ch, ch.getClassName() === 'Text');
          this.contentLayer.add(ch.clone());
        });
      }
      // re-add transformer
      this.contentLayer.add(this.transformer);
      this.contentLayer.draw();
      this._commitHistory();
    } catch (e) {
      console.warn('loadFromJSON failed', e);
    }
  }

  _commitHistory() {
    if (this._historyThrottle) cancelAnimationFrame(this._historyThrottle);
    this._historyThrottle = requestAnimationFrame(() => {
      const snapshot = this.serialize();
      this.onHistory(snapshot);
      window.dispatchEvent(new CustomEvent('canvas:history', { detail: { snapshot } }));
    });
  }
}
