// canvasManager.js — core Konva interactions, tracing, export
// Keep this file alongside app.js. Uses Konva, ClipperLib, FileSaver (CDNs from index.html).

const stageWidth = 1100, stageHeight = 760;
let stage, baseLayer;
let selection = null;
let showCut = true;
const wrappers = []; // wrapper objects per image layer

export function initCanvas(){
  const parent = document.getElementById('stage-parent');
  parent.innerHTML = '';
  const container = document.createElement('div');
  container.id = 'stage';
  container.style.width = '100%';
  container.style.height = '100%';
  parent.appendChild(container);

  stage = new Konva.Stage({ container: container, width: stageWidth, height: stageHeight });
  baseLayer = new Konva.Layer();
  stage.add(baseLayer);

  // white background
  const bg = new Konva.Rect({ x:0, y:0, width:stageWidth, height:stageHeight, fill:'#ffffff' });
  baseLayer.add(bg);
  baseLayer.draw();

  // wheel resize (desktop)
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
    const newScale = Math.max(0.05, current * (1 - delta * fine));
    node.group.scale({x:newScale,y:newScale});
    node.scaleX = newScale; node.scaleY = newScale;
    baseLayer.batchDraw();
  }, {passive:false});

  // touch: enable multitouch gestures handled by Konva transforms (use transformer on selection)
  stage.on('click tap', (e)=>{ if(e.target === stage) { selection = null; } });
}

function findImageWrapperForKonva(shape){
  if(!shape) return null;
  let cur = shape;
  while(cur && !cur._wrapper){ cur = cur.getParent(); }
  return cur ? cur._wrapper : null;
}

export async function addImageLayer(imgElement, name){
  // create group for layer so transforms are local
  const group = new Konva.Group({ x:50 + wrappers.length*12, y:50 + wrappers.length*12, draggable:true });
  const kImg = new Konva.Image({ image: imgElement, width: imgElement.width, height: imgElement.height });

  // scale big images down for workspace convenience
  const maxDim = 320;
  let scale = 1;
  if(imgElement.width > maxDim || imgElement.height > maxDim){
    scale = Math.min(maxDim / imgElement.width, maxDim / imgElement.height);
    kImg.width(imgElement.width * scale);
    kImg.height(imgElement.height * scale);
  }

  group.add(kImg);

  // cutline preview path
  const path = new Konva.Path({ data:'', stroke:'#ef476f', strokeWidth:2, listening:false, visible:false });
  group.add(path);

  // add transformer for direct touch friendly manipulation
  const tr = new Konva.Transformer({
    nodes: [kImg],
    anchorSize:10,
    rotateAnchorOffset:40,
    enabledAnchors: ['top-left','top-right','bottom-left','bottom-right'],
    keepRatio: true,
    boundBoxFunc: (oldBox, newBox) => newBox
  });
  group.add(tr);
  tr.hide();

  // wrapper
  const wrapper = {
    id: 'img-' + (wrappers.length + 1),
    name: name || ('img-'+(wrappers.length+1)),
    imgElement, group, kImg, tr, tracePath: null, locked:false, rotation:0, scaleX:scale, scaleY:scale,
    async traceSilhouette(){ const svgPath = await traceSilhouetteFromImage(this.imgElement, 8); this.tracePath = svgPath; path.data(svgPath); path.visible(showCut); baseLayer.batchDraw(); }
  };
  group._wrapper = wrapper;

  // selection handling — click group to select
  group.on('click tap', ()=>{ selection = wrapper; highlightSelection(wrapper); });

  // drag update
  group.on('dragmove', ()=> baseLayer.batchDraw());

  baseLayer.add(group);
  wrappers.push(wrapper);
  baseLayer.draw();

  // show transform when tapped (mobile)
  kImg.on('transformstart', ()=>{ tr.show(); baseLayer.batchDraw(); });
  kImg.on('transformend', ()=>{ tr.hide(); baseLayer.batchDraw(); });

  return wrapper;
}

function highlightSelection(wrapper){
  // show/hide transformer and set selection
  wrappers.forEach(w => {
    if(w.tr) w.tr.hide();
  });
  if(wrapper && wrapper.tr){
    wrapper.tr.nodes([wrapper.kImg]);
    wrapper.tr.show();
  }
  baseLayer.batchDraw();
}

// getter
export function getSelectedLayer(){ return selection; }

// remove layer
export function deleteSelected(){
  if(!selection) return;
  selection.group.destroy();
  const i = wrappers.indexOf(selection);
  if(i>=0) wrappers.splice(i,1);
  selection = null;
  baseLayer.batchDraw();
}

// make text sticker inside selected group
export function makeTextSticker(text = 'Label'){
  if(!selection) return;
  const g = selection.group;
  const txt = new Konva.Text({
    text, x: 10, y: 10, fontSize: 20, fontFamily: 'Inter, Arial, sans-serif',
    fill: '#0b1724', padding:6, draggable:true
  });
  // white rounded background pill
  const bg = new Konva.Rect({ x: -6, y: -6, width: txt.width()+12, height: txt.height()+12, fill:'#ffffff', cornerRadius:8, listening:false });
  const container = new Konva.Group({ draggable:true });
  container.add(bg);
  container.add(txt);
  // sync bg size
  txt.on('transform resize', ()=>{ bg.width(txt.width()+12); bg.height(txt.height()+12); });
  txt.on('dragmove', ()=> baseLayer.batchDraw());
  g.add(container);
  baseLayer.batchDraw();
}

// save/load project JSON
export function toJSON(){
  return {
    meta: { width: stageWidth, height: stageHeight, units: 'px' },
    layers: wrappers.map(w => ({
      id: w.id,
      name: w.name,
      x: w.group.x(),
      y: w.group.y(),
      scaleX: w.group.scaleX(),
      scaleY: w.group.scaleY(),
      rotation: w.group.rotation(),
      tracePath: w.tracePath
    }))
  };
}

export function loadFromJSON(json){
  // clear current
  wrappers.forEach(w=> w.group.destroy());
  wrappers.length = 0;
  selection = null;
  const data = json.layers || [];
  data.forEach((ld, idx) => {
    // create a placeholder image (real projects should embed base64 images in json)
    const placeholder = new Image();
    placeholder.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='100%' height='100%' fill='#f3f6fb'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='22' fill='#333'>${ld.name||'img'}</text></svg>`);
    placeholder.onload = () => {
      addImageLayer(placeholder, ld.name || ('img-'+idx)).then(w => {
        w.group.position({ x: ld.x, y: ld.y });
        w.group.scale({ x: ld.scaleX || 1, y: ld.scaleY || 1 });
        w.group.rotation(ld.rotation || 0);
        if(ld.tracePath){ w.tracePath = ld.tracePath; const p = w.group.findOne('Path'); if(p) { p.data(ld.tracePath); p.visible(showCut); } }
      });
    };
  });
}

// toggle cutline visibility
export function toggleCutLines(){ showCut = !showCut; wrappers.forEach(w=>{ const p = w.group.findOne('Path'); if(p) p.visible(showCut); }); baseLayer.batchDraw(); }

// auto arrange (grid)
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
}

// export PNG (high-res)
export async function exportPNG(){
  // create dataURL from stage at pixelRatio (2)
  const dataURL = stage.toDataURL({ pixelRatio: 2 });
  const res = await (await fetch(dataURL)).blob();
  return res;
}

// export SVG — embed images as data URLs and add cut paths
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
    if(item.tracePath) svg.push(`<path d='${item.tracePath}' fill='none' stroke='#ef476f' stroke-width='2' />`);
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
  // build mask & contour
  const mask = buildBinaryMask(imgElement, threshold);
  const pts = marchingSquares(mask);
  if(!pts) return '';
  // attempt offset with Clipper for a nicer die-cut outer offset
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
