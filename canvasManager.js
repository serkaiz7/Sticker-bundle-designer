/* canvasManager.js
 * Encapsulates Konva Stage, scaling, layers, guides, grid, and object helpers.
 */

const A4_WIDTH = 1123;  // px @96dpi, landscape
const A4_HEIGHT = 794;

export class CanvasManager {
  constructor(containerId, onHistory) {
    this.container = document.getElementById(containerId);
    this.onHistory = onHistory || (() => {});
    this.pixelRatioExport = 2;
    this.snapThreshold = 10;
    this.isSpaceDown = false;

    // Stage & layers
    this.stage = new Konva.Stage({
      container: containerId,
      width: A4_WIDTH,
      height: A4_HEIGHT,
      draggable: false
    });

    this.backgroundLayer = new Konva.Layer();
    this.gridLayer = new Konva.Layer({ listening: false, visible: false });
    this.contentLayer = new Konva.Layer();
    this.guideLayer = new Konva.Layer({ listening: false });

    this.stage.add(this.backgroundLayer);
    this.stage.add(this.gridLayer);
    this.stage.add(this.contentLayer);
    this.stage.add(this.guideLayer);

    // Canvas backing rect (to visualize A4 area)
    this.paper = new Konva.Rect({
      x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT,
      fill: '#ffffff', cornerRadius: 2,
      shadowBlur: 24, shadowColor: 'rgba(0,0,0,0.18)'
    });
    this.backgroundLayer.add(this.paper);

    // Transformer (selection handles)
    this.transformer = new Konva.Transformer({
      rotateEnabled: true,
      enabledAnchors: ['top-left','top-right','bottom-left','bottom-right'],
      anchorCornerRadius: 6,
      anchorStroke: '#7c5cff',
      anchorFill: '#7c5cff',
      borderStroke: '#7c5cff',
      borderDash: [4,4]
    });
    this.contentLayer.add(this.transformer);

    // Drag selection
    this.selectionRect = new Konva.Rect({
      fill: 'rgba(124,92,255,0.1)', stroke: '#7c5cff', dash: [4,4], visible: false
    });
    this.contentLayer.add(this.selectionRect);

    this._bindStageEvents();
    this._initGridLines();
    this.fitStageIntoParent();
    this._uiStatus();

    window.addEventListener('resize', () => this.fitStageIntoParent(), { passive: true });
  }

  _bindStageEvents(){
    // Selection logic
    this.stage.on('mousedown touchstart', (e) => {
      if (e.target === this.paper || e.target === this.stage) {
        this.transformer.nodes([]);
        this._startSelection();
      }
    });

    this.stage.on('mousemove touchmove', () => this._updateSelection());
    this.stage.on('mouseup touchend', () => this._endSelection());

    // Object selection
    this.contentLayer.on('click tap', (e) => {
      const target = e.target;
      if (target && target !== this.paper && target.getAttr('selectable')) {
        this.transformer.nodes([target]);
        this._showTextToolbarIfText(target);
      } else {
        this.transformer.nodes([]);
        this._hideTextToolbar();
      }
    });

    // Drag snapping
    this.contentLayer.on('dragmove', (e) => {
      this._updateGuides(e.target);
    });
    this.contentLayer.on('dragend transformend', (e) => {
      this.guideLayer.destroyChildren(); this.guideLayer.draw();
      this._commitHistory();
    });

    // Zoom
    this.stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const scaleBy = 1.06;
      const oldScale = this.stage.scaleX();
      const pointer = this.stage.getPointerPosition();
      const mousePointTo = {
        x: (pointer.x - this.stage.x()) / oldScale,
        y: (pointer.y - this.stage.y()) / oldScale,
      };
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
      this.stage.scale({ x: newScale, y: newScale });

      const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      };
      this.stage.position(newPos);
      this.stage.batchDraw();
      this._uiStatus();
    });

    // Pan with spacebar
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { this.isSpaceDown = true; this.stage.draggable(true); document.body.classList.add('panning'); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { this.isSpaceDown = false; this.stage.draggable(false); document.body.classList.remove('panning'); }
    });

    // Deselect text toolbar when clicking outside
    this.stage.on('click', (e) => {
      if (e.target === this.stage || e.target === this.paper) this._hideTextToolbar();
    });
  }

  _startSelection(){
    const pos = this.stage.getPointerPosition();
    this.selectionStart = pos;
    this.selectionRect.visible(true);
    this.selectionRect.width(0); this.selectionRect.height(0);
    this.selectionRect.position(pos);
    this.contentLayer.draw();
  }
  _updateSelection(){
    if (!this.selectionRect.visible()) return;
    const pos = this.stage.getPointerPosition();
    const sx = this.selectionStart.x, sy = this.selectionStart.y;
    this.selectionRect.setAttrs({
      x: Math.min(sx, pos.x),
      y: Math.min(sy, pos.y),
      width: Math.abs(pos.x - sx),
      height: Math.abs(pos.y - sy)
    });
    this.contentLayer.batchDraw();
  }
  _endSelection(){
    if (!this.selectionRect.visible()) return;
    const box = this.selectionRect.getClientRect();
    const nodes = this.contentLayer.find('.object').toArray().filter(n => Konva.Util.haveIntersection(box, n.getClientRect()));
    this.transformer.nodes(nodes);
    this.selectionRect.visible(false);
    this.contentLayer.batchDraw();
  }

  _initGridLines(){
    const spacing = 40;
    for (let x = 0; x <= A4_WIDTH; x += spacing) {
      this.gridLayer.add(new Konva.Line({ points:[x,0,x,A4_HEIGHT], stroke:'#e0e0e0', opacity:0.08 }));
    }
    for (let y = 0; y <= A4_HEIGHT; y += spacing) {
      this.gridLayer.add(new Konva.Line({ points:[0,y,A4_WIDTH,y], stroke:'#e0e0e0', opacity:0.08 }));
    }
    // Center lines
    this.gridLayer.add(new Konva.Line({ points:[A4_WIDTH/2,0,A4_WIDTH/2,A4_HEIGHT], stroke:'#7c5cff', opacity:0.18, dash:[6,6]}));
    this.gridLayer.add(new Konva.Line({ points:[0,A4_HEIGHT/2,A4_WIDTH,A4_HEIGHT/2], stroke:'#7c5cff', opacity:0.18, dash:[6,6]}));
  }
  toggleGrid(){
    this.gridLayer.visible(!this.gridLayer.visible());
    this.gridLayer.draw();
  }

  fitStageIntoParent() {
    const parent = this.container;
    const containerWidth = parent.clientWidth;
    const containerHeight = parent.clientHeight;
    const scale = Math.min(containerWidth / A4_WIDTH, containerHeight / A4_HEIGHT);
    this.stage.width(A4_WIDTH * scale);
    this.stage.height(A4_HEIGHT * scale);
    this.stage.scale({ x: scale, y: scale });
    this.stage.position({ x: (containerWidth - A4_WIDTH * scale) / 2, y: (containerHeight - A4_HEIGHT * scale) / 2 });
    this.stage.draw();
    this._uiStatus();
  }

  _uiStatus(){
    const zoomLabel = document.getElementById('status-zoom');
    const sizeLabel = document.getElementById('status-size');
    if (zoomLabel) zoomLabel.textContent = `Zoom: ${Math.round(this.stage.scaleX() * 100)}%`;
    if (sizeLabel) sizeLabel.textContent = `Canvas: ${A4_WIDTH}×${A4_HEIGHT}`;
  }

  addText({ text="Double-click to edit", fontFamily="Poppins", fontSize=48, fill="#111111" } = {}){
    const node = new Konva.Text({
      x: A4_WIDTH/2 - 200, y: A4_HEIGHT/2 - 24, width: 400,
      text, fontFamily, fontSize, fill,
      draggable: true,
      name: 'object',
      selectable: true,
      listening: true,
      shadowColor: 'white', shadowBlur: 10, shadowOpacity: 1, // subtle sticker halo
      shadowEnabled: false
    });
    this._wireNode(node, true);
    this.contentLayer.add(node);
    this.contentLayer.draw();
    this._commitHistory();
    return node;
  }

  async addImageFromFile(file){
    const dataUrl = await this._fileToDataURL(file);
    return this.addImageFromURL(dataUrl);
  }
  addImageFromURL(url){
    return new Promise((resolve) => {
      const imageObj = new Image();
      imageObj.onload = () => {
        const ratio = Math.min(320 / imageObj.width, 320 / imageObj.height, 1);
        const img = new Konva.Image({
          image: imageObj,
          x: A4_WIDTH/2 - (imageObj.width*ratio)/2,
          y: A4_HEIGHT/2 - (imageObj.height*ratio)/2,
          width: imageObj.width * ratio,
          height: imageObj.height * ratio,
          draggable: true,
          name: 'object',
          selectable: true,
          listening: true,
          // "Die-cut" look via shadow-as-stroke halo (fast, alpha-friendly)
          shadowColor: 'white',
          shadowBlur: 24,
          shadowOpacity: 1,
          shadowForStrokeEnabled: false
        });
        img.setAttr('stickerOutline', true); // flag so UI can toggle halo thickness later
        this._wireNode(img, false);
        this.contentLayer.add(img);
        this.contentLayer.draw();
        this._commitHistory();
        resolve(img);
      };
      imageObj.src = url;
    });
  }

  _wireNode(node, isText){
    node.on('dragmove', () => this._snapNode(node));
    node.on('transformend dragend', () => this._commitHistory());
    node.on('dblclick dbltap', () => {
      if (isText) this._enterInlineEdit(node);
    });
    node.on('click tap', () => {
      this.transformer.nodes([node]);
      this._showTextToolbarIfText(node);
    });
    node.setAttr('selectable', true);
    node.on('transform', () => {
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      // Keep stroke/halo visually consistent (optional)
      if (node.getAttr('stickerOutline')) {
        const blurBase = 24;
        node.shadowBlur(blurBase / Math.max(scaleX, scaleY));
      }
    });
  }

  _enterInlineEdit(textNode){
    const stageBox = this.stage.container().getBoundingClientRect();
    const textAbsPos = textNode.getAbsolutePosition(this.contentLayer);
    const scale = this.stage.scaleX();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    textarea.value = textNode.text();
    textarea.style.position = 'absolute';
    textarea.style.top = stageBox.top + textAbsPos.y * scale + 'px';
    textarea.style.left = stageBox.left + textAbsPos.x * scale + 'px';
    textarea.style.width = textNode.width() * scale + 'px';
    textarea.style.fontSize = textNode.fontSize() * scale + 'px';
    textarea.style.fontFamily = textNode.fontFamily();
    textarea.style.color = textNode.fill();
    textarea.style.padding = '0px';
    textarea.style.margin = '0px';
    textarea.style.border = '1px solid #7c5cff';
    textarea.style.background = '#fff';
    textarea.style.outline = 'none';
    textarea.style.zIndex = 1000;

    textarea.focus();
    const removeTextarea = (commit=true) => {
      if (commit) {
        textNode.text(textarea.value);
        this.contentLayer.draw();
        this._commitHistory();
      }
      document.body.removeChild(textarea);
    };
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) removeTextarea(true);
      if (e.key === 'Escape') removeTextarea(false);
    });
    textarea.addEventListener('blur', () => removeTextarea(true));
  }

  _fileToDataURL(file){
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  // Simple center/edge and object-to-object snapping
  _snapNode(node){
    const box = node.getClientRect();
    const stageW = A4_WIDTH, stageH = A4_HEIGHT;
    const guides = [];
    const thresh = this.snapThreshold;

    const nodeCenter = { x: box.x + box.width/2, y: box.y + box.height/2 };

    // canvas center/edges
    const targets = [
      { x: stageW/2, y: null, type:'v' },
      { x: null, y: stageH/2, type:'h' },
      { x: 0, y: null, type:'v' },
      { x: stageW, y: null, type:'v' },
      { x: null, y: 0, type:'h' },
      { x: null, y: stageH, type:'h' },
    ];

    // other objects centers
    this.contentLayer.find('.object').each(o => {
      if (o === node) return;
      const b = o.getClientRect();
      targets.push({ x: b.x + b.width/2, y: null, type:'v' });
      targets.push({ x: null, y: b.y + b.height/2, type:'h' });
    });

    // Clea
