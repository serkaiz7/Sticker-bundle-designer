// canvasManager.js — core Konva interactions, tracing, export, undo/redo, A4 printable canvas
// Uses Konva, ClipperLib, FileSaver (CDNs included in index.html)

// A4 in millimeters
const A4_MM = { w: 210, h: 297 };

// history (undo / redo) — store snapshots of project JSON
let history = [], historyIndex = -1;
export function pushHistory(){
  try{
    const snap = toJSON();
    // if not at end, chop future states
    if(historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
    history.push(JSON.stringify(snap));
    historyIndex = history.length - 1;
    // limit history length
    if(history.length > 60){ history.shift(); historyIndex = history.length - 1; }
    // console.log('history.push', historyIndex, history.length);
  }catch(e){ console.warn('pushHistory failed', e); }
}
export function undoHistory(){
  if(historyIndex <= 0) return;
  historyIndex--;
  const state = JSON.parse(history[historyIndex]);
  loadFromJSON(state);
}
export function redoHistory(){
  if(historyIndex >= history.length - 1) return;
  historyIndex++;
  const state = JSON.parse(history[historyIndex]);
  loadFromJSON(state);
}
export function resetHistory(){
  history = []; historyIndex = -1;
  pushHistory();
}

// Stage and wrappers
let stage, baseLayer;
let selection = null;
let showCut = true;
const wrappers = [];

// convert mm -> px given DPI
function mmToPx(mm, dpi){ return Math.round((mm / 25.4) * dpi); }

// find DPI select value (default 300) — used at init and when user changes it
function getSelectedDPI(){
  const el = document.getElementById('export-dpi');
  let dpi = 300;
  if(el) dpi = Number(el.value) || 300;
  return dpi;
}

// initCanvas: creates a Konva stage sized to A4 in pixels (print size), then scales the container to fit the stage-parent
export function initCanvas(){
  const parent = document.getElementById('stage-parent');
  parent.innerHTML = '';
  const container = document.createElement('div');
  container.id = 'stage';
  container.style.position = 'relative';
  container.style.transformOrigin = 'top left';
  container.style.boxSizing = 'content-box';
  parent.appendChild(container);

  const dpi = getSelectedDPI();
  const pw = mmToPx(A4_MM.w, dpi);
  const ph = mmToPx(A4_MM.h, dpi);

  // create Konva stage with print pixel size
  stage = new Konva.Stage({ container: container, width: pw, height: ph });
  baseLayer = new Konva.Layer();
  stage.add(baseLayer);

  // white background (print white)
  const bg = new Konva.Rect({ x:0, y:0, width: pw, height: ph, fill:'#ffffff' });
  baseLayer.add(bg);
  baseLayer.draw();

  // fit stage to container (scale down to fit UI)
  fitStageToContainer();

  // fit on resize or DPI change
  window.addEventListener('resize', fitStageToContainer);
  const dpiEl = document.getElementById('export-dpi');
  if(dpiEl) dpiEl.addEventListener('change', ()=>{ // recreate stage to match new pixel size
    // tear down existing stage and recreate
    try{ stage.destroy(); }catch(e){}
    initCanvas();
    // reload history first snapshot if present
    if(historyIndex >= 0 && history[historyIndex]) {
      const state = JSON.parse(history[historyIndex]);
      loadFromJSON(state);
    }
  });

  // wheel resize (desktop): scale focused image group
  stage.container().addEventListener('wheel', (e)=>{
    const pointer = stage.getPointerPosition();
    if(!pointer) return;
    const shape = stage.getIntersection(pointer);
    if(!shape) return;
    const node = findImageWrapperForKonva(shape);
    if(!node) return;
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const fine = e.shiftKey ? 0.01 : 0.06;
    const current = node.group.scaleX();
    const newScale = Math.max(0.02, current * (1 - delta * fine));
    node.group.scale({ x: newScale, y: newScale });
    node.scaleX = newScale; node.scaleY = newScale;
    baseLayer.batchDraw();
  }, { passive: false });

  // push initial empty state to history
  resetHistory();
}

// Fit the Konva stage (print px) visually into the stage-parent by scaling the container DOM element
function fitStageToContainer(){
  if(!stage) return;
  const parent = document.getElementById('stage-parent');
  const container = stage.container();
  // parent inner size (account for padding)
  const availableW = parent.clientWidth - 20;
  const availableH = parent.clientHeight - 20;
  const stageW = stage.width();
  const stageH = stage.height();
  const scale = Math.min(availableW / stageW, availableH / stageH, 1);
  // apply CSS transform scale to Konva container
  container.style.transform = `scale(${scale})`;
  container.style.width = `${stageW}px`;
  container.style.height = `${stageH}px`;
  // center it visually
  container.style.margin = '0 auto';
}

// helper to locate wrapper from clicked Konva node
function findImageWrapperForKonva(shape){
  if(!shape) return null;
  let cur = shape;
  while(cur && !cur._wrapper){ cur = cur.getParent(); }
  return cur ? cur._wrapper : null;
}

// add image layer (keeps real print pixel coordinates via stage)
export async function addImageLayer(imgElement, name){
  const group = new Konva.Group({ x:50 + wrappers.length*12, y:50 + wrappers.length*12, draggable:true });
  const kImg = new Konva.Image({ image: imgElement, width: imgElement.width, height: imgElement.height });

  // scale big images down for workspace convenience (these are still in print px units)
  const maxDim = Math.min(stage.width() * 0.3, 800);
  let scale = 1;
  if(imgElement.width > maxDim || imgElement.height > maxDim){
    scale = Math.min(maxDim / imgElement.width, maxDim / imgElement.height);
    kImg.width(imgElement.width * scale);
    kImg.height(imgElement.height * scale);
  }

  group.add(kImg);

  // cutline preview
  const path = new Konva.Path({ data:'', stroke:'#ef476f', strokeWidth:4, listening:false, visible:false });
  group.add(path);

  // transformer (touch friendly)
  const tr = new Konva.Transformer({
    nodes: [kImg],
    anchorSize:10,
    rotateAnchorOffset:40,
    enabledAnchors: ['top-left','top-right','bottom-left','bottom-right'],
    keepRatio: true,
  });
  group.add(tr);
  tr.hide();

  const wrapper = {
    id: 'img-' + (wrappers.length + 1),
    name: name || ('img-' + (wrappers.length + 1)),
    imgElement, group, kImg, tr, tracePath: null, locked:false, rotation:0, scaleX:scale, scaleY:scale,
    async traceSilhouette(){ const svgPath = await traceSilhouetteFromImage(this.imgElement, 8); this.tracePath = svgPath; path.data(svgPath); path.visible(showCut); baseLayer.batchDraw(); }
  };
  group._wrapper = wrapper;

  // selection and events
  group.on('click tap', ()=> { selection = wrapper; highlightSelection(wrapper); });
  group.on('dragend', ()=> { baseLayer.batchDraw(); pushHistory(); });
  kImg.on('transformend', ()=> { // when user scales/rotates
    wrapper.scaleX = kImg.scaleX(); wrapper.scaleY = kImg.scaleY();
    wrapper.rotation = kImg.rotation();
    pushHistory();
    baseLayer.batchDraw();
  });

  baseLayer.add(group);
  wrappers.push(wrapper);
  baseLayer.draw();
  pushHistory();
  return wrapper;
}

function highlightSelection(wrapper){
  wrappers.forEach(w => { if(w.tr) w.tr.hide(); });
  if(wrapper && wrapper.tr){ wrapper.tr.nodes([wrapper.kImg]); wrapper.tr.show(); }
  baseLayer.batchDraw();
}

export function getSelectedLayer(){ return selection; }

export function deleteSelected(){
  if(!selection) return;
  selection.group.destroy();
  const i = wrappers.indexOf(selection);
  if(i>=0) wrappers.splice(i,1);
  selection = null;
  baseLayer.batchDraw();
  pushHistory();
}

export function makeTextSticker(text = 'Label'){
  if(!selection) return;
  const g = selection.group;
  const txt = new Konva.Text({
    text, x: 10, y: 10, fontSize: 36, fontFamily: 'Inter, Arial, sans-serif',
    fill: '#0b1724', padding:10, draggable:true
  });
  const bg = new Konva.Rect({ x: -12, y: -12, width: txt.width() + 24, height: txt.height() + 24, fill: '#ffffff', cornerRadius:999, listening:false });
  const container = new Konva.Group({ draggable:true });
  container.add(bg); container.add(txt);
  // update background size when text changes (if edited later)
  txt.on('transform resize', ()=>{ bg.width(txt.width()+24); bg.height(txt.height()+24); });
  txt.on('dragend', ()=> baseLayer.batchDraw());
  g.add(container);
  baseLayer.batchDraw();
  pushHistory();
}

// Save / Load JSON (project serialization)
export function toJSON(){
  return {
    meta: { width: stage.width(), height: stage.height(), dpi: getSelectedDPI(), units:'px' },
    layers: wrappers.map(w => ({
      id: w.id,
      name: w.name,
      x: w.group.x(),
      y: w.group.y(),
      scaleX: w.group.scaleX(),
      scaleY: w.group.scaleY(),
      rotation: w.group.rotation(),
      // Note: images are not embedded here; for portability embed base64 in 'imageData' property if desired.
      tracePath: w.tracePath
    }))
  };
}

export function loadFromJSON(json){
  // clear current
  wrappers.forEach(w => w.group.destroy());
  wrappers.length = 0;
  selection = null;

  const li = (json && json.layers) ? json.layers : [];
  li.forEach((ld, idx) => {
    // because we didn't embed images, create placeholders — real project JSON should include base64 images
    const placeholder = new Image();
    placeholder.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='100%' height='100%' fill='#f3f6fb'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='32' fill='#333'>${ld.name||'img'}</text></svg>`);
    placeholder.onload = () => {
      addImageLayer(placeholder, ld.name || ('img-'+idx)).then(w => {
        w.group.position({ x: ld.x, y: ld.y });
        w.group.scale({ x: ld.scaleX || 1, y: ld.scaleY || 1 });
        w.group.rotation(ld.rotation || 0);
        if(ld.tracePath){ w.tracePath = ld.tracePath; const p = w.group.findOne('Path'); if(p){ p.data(ld.tracePath); p.visible(showCut); } }
        baseLayer.batchDraw();
      });
    };
  });

  // after loading, ensure history picks up this state if it exists in history
  baseLayer.batchDraw();
}

// toggle cutline visibility
export function toggleCutLines(){ showCut = !showCut; wrappers.forEach(w => { const p = w.group.findOne('Path'); if(p) p.visible(showCut); }); baseLayer.batchDraw(); }

// auto arrange grid
export function autoArrangeGrid(cols = 3, rows = 3){
  const padding = 18;
  const cellW = (stage.width() - padding * (cols + 1)) / cols;
  const cellH = (stage.height() - padding * (rows + 1)) / rows;
  wrappers.forEach((w, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;
    const x = padding + col * (cellW + padding) + (cellW - (w.kImg.width() || 100)) / 2;
    const y = padding + row * (cellH + padding) + (cellH - (w.kImg.height() || 80)) / 2;
    w.group.position({ x, y });
  });
  baseLayer.batchDraw();
  pushHistory();
}

// export PNG & SVG (PNG uses stage.toDataURL to preserve actual pixels)
export async function exportPNG(){
  // export at 1:1 stage pixels (which is print px)
  const dataURL = stage.toDataURL({ pixelRatio: 1 });
  const res = await (await fetch(dataURL)).blob();
  return res;
}

export function exportSVG(){
  const w = stage.width(), h = stage.height();
  const svg = [`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>`];
  svg.push(`<rect width='100%' height='100%' fill='#ffffff'/>`);
  for(const item of wrappers){
    const x = item.group.x(), y = item.group.y();
    const img = document.createElement('canvas');
    img.width = item.imgElement.width; img.height = item.imgElement.height;
    const ctx = img.getContext('2d'); ctx.drawImage(item.imgElement, 0, 0);
    const data = img.toDataURL('image/png');
    svg.push(`<image href='${data}' x='${x}' y='${y}' width='${item.kImg.width()}' height='${item.kImg.height()}' />`);
    if(item.tracePath) svg.push(`<path d='${item.tracePath}' fill='none' stroke='#ef476f' stroke-width='4' />`);
  }
  svg.push('</svg>');
  return svg.join('\n');
}

// ------------------------
// Tracing helpers (prototype)
// ------------------------

function buildBinaryMask(img, threshold = 10){
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height).data;
  const mask = new Uint8Array(c.width * c.height);
  for(let i=0;i<c.width*c.height;i++){ const a = id[i*4 + 3]; mask[i] = a > threshold ? 1 : 0; }
  return { mask, w: c.width, h: c.height };
}

// simple contour walk (best-effort)
function marchingSquares(maskObj){
  const { mask, w, h } = maskObj;
  let start = -1;
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      if(mask[y*w + x]){ start = y*w + x; break; }
    }
    if(start !== -1) break;
  }
  if(start === -1) return null;
  let sx = start % w, sy = Math.floor(start / w);
  const dirs = [[1,0],[0,1],[-1,0],[0,-1]];
  let x = sx, y = sy, dir = 0;
  const pts = [];
  for(let steps=0; steps<20000; steps++){
    pts.push([x, y]);
    let found=false;
    for(let k=0;k<4;k++){
      const nd = (dir + 3 + k) % 4;
      const nx = x + dirs[nd][0], ny = y + dirs[nd][1];
      if(nx>=0 && nx<w && ny>=0 && ny<h && mask[ny*w + nx]){ x = nx; y = ny; dir = nd; found=true; break; }
    }
    if(!found) break;
    if(x === sx && y === sy) break;
  }
  if(pts.length < 3) return null;
  return pts.map(p => [p[0], p[1]]);
}

function polygonToSVGPath(points){
  if(!points || points.length === 0) return '';
  return 'M ' + points.map(p => `${p[0]} ${p[1]}`).join(' L ') + ' Z';
}

async function traceSilhouetteFromImage(imgElement, threshold = 10){
  const mask = buildBinaryMask(imgElement, threshold);
  const pts = marchingSquares(mask);
  if(!pts) return '';
  try{
    const scale = 8;
    const subj = [ pts.map(p => ({ X: Math.round(p[0]*scale), Y: Math.round(p[1]*scale) })) ];
    const co = new ClipperLib.ClipperOffset();
    co.AddPaths(subj, ClipperLib.JT_ROUND, ClipperLib.ET_CLOSEDPOLYGON);
    const solution = new ClipperLib.Paths();
    co.Execute(solution, 6 * scale);
    if(solution && solution.length){
      const sol = solution[0].map(p => [p.X / scale, p.Y / scale]);
      return polygonToSVGPath(sol);
    }
  }catch(e){
    console.warn('Clipper failed', e);
  }
  return polygonToSVGPath(pts);
}
