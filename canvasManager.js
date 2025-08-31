// canvasManager.js
// Exports CanvasManager for the app. Use as an ES module.

export class CanvasManager {
  constructor(containerId, opts = {}) {
    this.containerId = containerId;
    this.onHistory = opts.onHistory || (() => {});
    this.A4 = { w: 1123, h: 794 }; // px @96dpi
    this.pixelRatioExport = opts.pixelRatio || 2;
    this.snapThreshold = 10;
    this._initStage();
    this._initLayers();
    this._initTransformer();
    this._initGrid();
    this._bindStageEvents();
    this.historyThrottle = null;
  }

  _initStage() {
    const container = document.getElementById(this.containerId);
    // Ensure container has size
    container.style.width = `${this.A4.w}px`;
    container.style.height = `${this.A4.h}px`;
    this.stage = new Konva.Stage({
      container: this.containerId,
      width: this.A4.w,
      height: this.A4.h,
      draggable: false,
    });
    // background rect representing paper
    this.bgLayer = new Konva.Layer();
    this.paper = new Konva.Rect({
      x: 0, y: 0, width: this.A4.w, height: this.A4.h, fill: '#ffffff', cornerRadius: 6,
      shadowColor: 'rgba(3,6,23,0.12)', shadowBlur: 24
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
      borderDash: [6,6],
      anchorFill: '#fff',
      anchorStroke: '#6f5cff',
      anchorStrokeWidth: 2,
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
    // center lines
    this.gridLayer.add(new Konva.Line({ points: [this.A4.w/2,0,this.A4.w/2,this.A4.h], stroke: '#6f5cff', dash:[6,6], opacity:0.15 }));
    this.gridLayer.add(new Konva.Line({ points: [0,this.A4.h/2,this.A4.w,this.A4.h/2], stroke: '#6f5cff', dash:[6,6], opacity:0.15 }));
  }

  _bindStageEvents() {
    // selection by click
    this.contentLayer.on('click tap', (e) => this._handleContentClick(e));
    // drag move snapping + guide
    this.contentLayer.on('dragmove', (e) => this._snapNode(e.target));
    this.contentLayer.on('dragend transformend', () => { this._clearGuides(); this._commitHistory(); });
    // wheel zoom
    this.stage.on('wheel', (e) => this._handleWheel(e));
    // double click inline text handled externally by app when needed
  }

  _handleContentClick(e){
    const target = e.target;
    if (target === this.paper || target === this.stage) {
      this.transformer.nodes([]);
      return;
    }
    if (target.getAttr && target.getAttr('selectable')) {
      this.transformer.nodes([target]);
    } else {
      this.transformer.nodes([]);
    }
  }

  toggleGrid() {
    this.gridLayer.visible(!this.gridLayer.visible());
    this.gridLayer.draw();
  }

  fitToContainer() {
    // optional: scale to fit parent container — left to app to call on resize
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
    const { text='Double-click to edit', fontFamily='Poppins', fontSize=36, fill='#111' } = opts;
    const txt = new Konva.Text({
      x: this.A4.w/2 - 200, y: this.A4.h/2 - 24, width: 400,
      text, fontFamily, fontSize, fill, draggable: true, name: 'object', selectable: true
    });
    this._setupObject(txt, true);
    this.contentLayer.add(txt); this.contentLayer.draw();
    this._commitHistory();
    return txt;
  }

  async addImageFromFile(file){
    const url = await this._fileToDataURL(file);
    return this.addImageFromURL(url);
  }

  addImageFromURL(url){
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(360 / img.width, 360 / img.height, 1);
        const kimg = new Konva.Image({
          image: img, x: this.A4.w/2 - (img.width*ratio)/2, y: this.A4.h/2 - (img.height*ratio)/2,
          width: img.width*ratio, height: img.height*ratio, draggable:true, name:'object', selectable:true
        });
        // subtle die-cut effect via shadow + stroke
        kimg.shadowColor('#fff'); kimg.shadowBlur(18); kimg.shadowOpacity(1);
        kimg.stroke('#fff'); kimg.strokeWidth(8); kimg.strokeScaleEnabled(false);
        this._setupObject(kimg, false);
        this.contentLayer.add(kimg); this.contentLayer.draw();
        this._commitHistory();
        resolve(kimg);
      };
      img.src = url;
    });
  }

  _setupObject(node, isText=false) {
    node.on('dragmove', () => this._snapNode(node));
    node.on('transformend dragend', () => this._commitHistory());
    node.setAttr('selectable', true);
    node.name && node.name(); // noop to avoid linter
  }

  _fileToDataURL(file){
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = (e) => res(e.target.result);
      r.readAsDataURL(file);
    });
  }

  _snapNode(node){
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
    // include other objects' centers
    this.contentLayer.find('.object').each(o => {
      if (o === node) return;
      const b = o.getClientRect();
      targets.push({ x: b.x + b.width/2, y:null });
      targets.push({ x:null, y: b.y + b.height/2 });
    });

    // clear previous guides
    this._clearGuides();
    const guides = [];
    targets.forEach(t => {
      if (t.x !== null){
        if (Math.abs(center.x - t.x) < this.snapThreshold){
          const dx = t.x - center.x;
          node.x(node.x() + dx);
          guides.push(new Konva.Line({ points:[t.x,0,t.x,this.A4.h], stroke:'#00c2a8', dash:[6,6], strokeWidth:1 }));
        }
      }
      if (t.y !== null){
        if (Math.abs(center.y - t.y) < this.snapThreshold){
          const dy = t.y - center.y;
          node.y(node.y() + dy);
          guides.push(new Konva.Line({ points:[0,t.y,this.A4.w,t.y], stroke:'#00c2a8', dash:[6,6], strokeWidth:1 }));
        }
      }
    });
    guides.forEach(g => this.guideLayer.add(g));
    this.guideLayer.batchDraw();
  }

  _clearGuides(){ this.guideLayer.destroyChildren(); this.guideLayer.draw(); }

  _handleWheel(e){
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
    // update UI label externally
    const evt = new CustomEvent('stage:scaled', { detail: { scale: newScale } });
    window.dispatchEvent(evt);
  }

  getSelectedNodes(){
    const nodes = this.transformer.nodes();
    return nodes || [];
  }

  deleteSelected(){
    const nodes = this.getSelectedNodes();
    nodes.forEach(n => n.destroy());
    this.transformer.nodes([]);
    this.contentLayer.draw();
    this._commitHistory();
  }

  duplicateSelected(){
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

  copySelected(){
    const nodes = this.getSelectedNodes();
    if (!nodes.length) return null;
    const json = nodes.map(n => n.toJSON());
    // store in memory
    this._clipboard = json;
    return json;
  }

  pasteClipboard(){
    if (!this._clipboard) return [];
    const added = [];
    this._clipboard.forEach(j => {
      const node = Konva.Node.create(j);
      // offset pasted items slightly
      node.x(node.x() + 12); node.y(node.y() + 12);
      node.setAttr('selectable', true);
      this._setupObject(node, node.getClassName() === 'Text');
      this.contentLayer.add(node);
      added.push(node);
    });
    this.contentLayer.draw(); this._commitHistory();
    return added;
  }

  groupSelected(){
    const nodes = this.getSelectedNodes();
    if (!nodes.length) return null;
    const group = new Konva.Group({ draggable:true, name:'object', selectable:true });
    nodes.forEach(n => {
      n.moveTo(group);
    });
    this.contentLayer.add(group);
    this.transformer.nodes([group]);
    this.contentLayer.draw(); this._commitHistory();
    return group;
  }

  ungroupSelected(){
    const nodes = this.getSelectedNodes();
    if (!nodes.length) return null;
    const groups = nodes.filter(n => n.getClassName() === 'Group');
    groups.forEach(g => {
      const children = g.getChildren().toArray();
      children.forEach(c => { c.moveTo(this.contentLayer); });
      g.destroy();
    });
    this.contentLayer.draw(); this._commitHistory();
  }

  nudgeSelected(dx, dy){
    const nodes = this.getSelectedNodes();
    nodes.forEach(n => { n.x(n.x() + dx); n.y(n.y() + dy); });
    this.contentLayer.draw(); this._commitHistory();
  }

  toDataURL(pixelRatio = this.pixelRatioExport){
    // temporary set white background for export
    const prevFill = this.paper.fill();
    this.paper.fill('#ffffff');
    this.bgLayer.draw();
    const dataUrl = this.stage.toDataURL({ pixelRatio });
    this.paper.fill(prevFill); this.bgLayer.draw();
    return dataUrl;
  }

  async toPDF(){
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    const imgData = this.toDataURL(this.pixelRatioExport);
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, 'PNG', 0, 0, w, h);
    return pdf;
  }

  serialize(){
    // include only contentLayer children (not bg/grid/guide)
    return this.stage.toJSON();
  }

  loadFromJSON(json){
    // clear contentLayer children and re-create from json
    const restored = Konva.Node.create(json);
    // remove existing content children except transformer placeholder
    this.contentLayer.destroyChildren();
    // find corresponding content layer in restored (approx by layer index)
    const layers = restored.find('Layer');
    let restoredContentLayer = null;
    if (layers && layers.length >= 2) restoredContentLayer = layers[1]; // best-effort
    if (!restoredContentLayer) {
      // fallback: add root nodes
      restored.getChildren().forEach(ch => { this.contentLayer.add(ch.clone()); });
    } else {
      restoredContentLayer.getChildren().forEach(ch => {
        // re-setup objects for events
        ch.setAttr && ch.setAttr('selectable', true);
        this._setupObject(ch, ch.getClassName() === 'Text');
        this.contentLayer.add(ch);
      });
    }
    // add transformer back
    this.contentLayer.add(this.transformer);
    this.contentLayer.draw();
  }

  _commitHistory(){
    if (this.historyThrottle) cancelAnimationFrame(this.historyThrottle);
    this.historyThrottle = requestAnimationFrame(() => {
      const snapshot = this.serialize();
      this.onHistory(snapshot);
      // broadcast event
      window.dispatchEvent(new CustomEvent('canvas:history', { detail: { snapshot } }));
    });
  }
}
