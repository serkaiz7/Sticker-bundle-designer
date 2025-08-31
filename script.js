// Kai Sticker Maker — premium single-file app
// Features:
// - A4 print-sized Konva stage that visually scales to fit
// - Upload images, add text, transformer selection (fixed)
// - Grid toggle, snap-to-guides (center, edges, other objects), red guidelines
// - Undo / Redo (snapshot stack) with reliable restore
// - Trace (prototype), preview modal, direct print and export PNG/SVG
// - Keyboard shortcuts: Ctrl/Cmd+Z (undo), Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z (redo)
// - Polished UI hooks for a Canva-like experience

// ---------- Configuration ----------
const A4_PX_300 = { w_mm: 210, h_mm: 297 }; // mm
function mmToPx(mm, dpi){ return Math.round((mm/25.4)*dpi); }

// initial DPI and computed stage pixels (we default to 300 but allow changing)
let dpiSelect = 300;
const defaultDPI = 300;

// DOM refs
const stageParent = document.getElementById('stage-parent');
const fileInput = document.getElementById('file-input');
const thumbs = document.getElementById('thumbs');
const gridBtn = document.getElementById('gridBtn');
const snapBtn = document.getElementById('snapBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const traceBtn = document.getElementById('traceBtn');
const deleteBtn = document.getElementById('deleteBtn');
const previewBtn = document.getElementById('previewBtn');
const previewBtn2 = document.getElementById('previewBtn2');
const downloadBtn = document.getElementById('downloadBtn');
const exportSvgBtn = document.getElementById('exportSvgBtn');
const printBtn = document.getElementById('printBtn');
const fontFamily = document.getElementById('fontFamily');
const fontSize = document.getElementById('fontSize');
const fontColor = document.getElementById('fontColor');
const textBtn = document.getElementById('textBtn');
const dpiSelectEl = document.getElementById('dpiSelect');
const previewModal = document.getElementById('previewModal');
const previewCanvas = document.getElementById('previewCanvas');
const closePreview = document.getElementById('closePreview');
const downloadPreview = document.getElementById('downloadPreview');
const printPreview = document.getElementById('printPreview');

const propPanel = document.getElementById('propPanel');
const propEmpty = document.getElementById('propEmpty');
const propLock = document.getElementById('propLock');
const propRotation = document.getElementById('propRotation');
const propScale = document.getElementById('propScale');
const propOpacity = document.getElementById('propOpacity');
const bringFrontBtn = document.getElementById('bringFront');
const sendBackBtn = document.getElementById('sendBack');
const duplicateBtn = document.getElementById('duplicate');

// state
let stage, mainLayer, guideLayer;
let history = [], historyIndex = -1;
let gridVisible = false;
let snapEnabled = true;
let selectedNode = null;

// ---------- Create Stage (A4 in px at selected DPI) ----------
function createStage(dpi = defaultDPI){
  dpiSelect = dpi;
  // clear parent
  stageParent.innerHTML = '';
  const stageDiv = document.createElement('div');
  stageDiv.style.width = 'auto';
  stageDiv.style.height = 'auto';
  stageParent.appendChild(stageDiv);

  const w_px = mmToPx(A4_PX_300.w_mm, dpi);
  const h_px = mmToPx(A4_PX_300.h_mm, dpi);

  // create Konva stage with real print pixels
  stage = new Konva.Stage({ container: stageDiv, width: w_px, height: h_px });
  mainLayer = new Konva.Layer();
  guideLayer = new Konva.Layer();
  stage.add(mainLayer);
  stage.add(guideLayer);

  // white paper bg
  const bg = new Konva.Rect({ x:0,y:0,width:w_px,height:h_px, fill:'#ffffff', listening:false });
  mainLayer.add(bg);
  mainLayer.draw();

  // scale the Konva container to fit parent visually (maintain real pixel size internally)
  fitStageToParent();

  // events
  stage.on('click tap', e => {
    if(e.target === stage || e.target === bg){
      clearSelection();
    }
  });

  // mouse wheel scale on hovered node
  stage.container().addEventListener('wheel', (e) => {
    const pos = stage.getPointerPosition();
    if(!pos) return;
    const shape = stage.getIntersection(pos);
    if(!shape) return;
    const wrapper = findWrapperFor(shape);
    if(!wrapper) return;
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const factor = e.shiftKey ? 0.01 : 0.06;
    const current = wrapper.group.scaleX();
    const next = Math.max(0.02, current * (1 - delta * factor));
    wrapper.group.scale({x:next,y:next});
    mainLayer.batchDraw();
    pushHistory(); // record scale change
  }, { passive:false });

  // keep stage fitted on resize
  window.addEventListener('resize', fitStageToParent);

  return stage;
}

function fitStageToParent(){
  if(!stage) return;
  const container = stage.container();
  const parentRect = stageParent.getBoundingClientRect();
  const padding = 24;
  const availW = parentRect.width - padding;
  const availH = parentRect.height - padding;
  const scale = Math.min(availW / stage.width(), availH / stage.height(), 1);
  container.style.transformOrigin = 'top left';
  container.style.transform = `scale(${scale})`;
  container.style.boxShadow = '0 18px 40px rgba(2,6,23,0.25)';
  container.style.borderRadius = '6px';
  container.style.background = '#fff';
}

// ---------- Wrapper objects (to track nodes + metadata) ----------
const wrappers = []; // { id, group, konvaNode, imgSrc? }

// helper to create unique id
function uid(prefix='id'){ return prefix + '-' + Math.random().toString(36).slice(2,9); }

// find wrapper by node or child
function findWrapperFor(node){
  if(!node) return null;
  for(const w of wrappers){
    if(w.group === node || w.konva === node) return w;
    // if clicked a child inside group (e.g. path), check ancestors
    let cur = node;
    while(cur && cur !== stage){
      if(cur === w.group) return w;
      cur = cur.getParent();
    }
  }
  return null;
}

// ---------- Node creation helpers ----------
async function addImageFromDataURL(dataURL, name){
  const img = new Image();
  img.src = dataURL;
  await img.decode();
  const konvaImg = new Konva.Image({
    image: img,
    x: 60,
    y: 60,
    draggable: true
  });
  mainLayer.add(konvaImg);

  // wrap
  const group = new Konva.Group({ x:0, y:0 });
  // add image directly to group for transform isolation
  const innerImg = new Konva.Image({ image: img, x:60, y:60, draggable:true });
  group.add(innerImg);

  // cutline preview path placeholder
  const cutPath = new Konva.Path({ data:'', stroke:'#ef476f', strokeWidth:6, listening:false, visible:false });
  group.add(cutPath);

  mainLayer.add(group);

  const wrapper = { id: uid('img'), group: group, konva: innerImg, imgSrc: dataURL };
  wrappers.push(wrapper);

  bindNodeEvents(wrapper);
  addVisualEffects(innerImg);

  mainLayer.draw();
  pushHistory();
  addThumb(dataURL, name);
  return wrapper;
}

function addTextNode(text='Text', opts={}){
  const t = new Konva.Text({
    text, x: 80, y: 80,
    fontFamily: opts.fontFamily || fontFamily.value || 'Inter',
    fontSize: opts.fontSize || parseInt(fontSize.value) || 32,
    fill: opts.color || fontColor.value || '#000000',
    draggable: true
  });
  // white pill behind
  const pad = 10;
  const bg = new Konva.Rect({
    x: t.x() - pad, y: t.y() - pad,
    width: t.width() + pad*2, height: t.height() + pad*2,
    fill: '#ffffff', cornerRadius: 999, listening:false
  });
  const group = new Konva.Group();
  group.add(bg);
  group.add(t);
  mainLayer.add(group);

  const wrapper = { id: uid('txt'), group, konva: t, isText: true };
  wrappers.push(wrapper);

  // keep bg synced
  t.on('transform move resize', () => {
    bg.position({ x: t.x() - pad, y: t.y() - pad });
    bg.width(t.width() + pad*2);
    bg.height(t.height() + pad*2);
  });

  bindNodeEvents(wrapper);
  addVisualEffects(t);
  mainLayer.draw();
  pushHistory();
  return wrapper;
}

function addThumb(dataURL, name){
  const img = document.createElement('img');
  img.src = dataURL;
  img.className = 'thumb';
  img.title = name || '';
  img.onclick = () => {
    // clone into canvas
    addImageFromDataURL(dataURL, name);
  };
  thumbs.prepend(img);
}

// ---------- Bind node interactions, transformer, snapping ----------
function bindNodeEvents(wrapper){
  const node = wrapper.konva;
  // selection
  node.on('click tap', (e) => {
    e.cancelBubble = true;
    selectWrapper(wrapper);
  });

  // drag + snapping
  node.on('dragmove', () => {
    if(snapEnabled) doSnap(wrapper);
    showGuides(wrapper);
    mainLayer.batchDraw();
  });

  node.on('dragend', () => { hideGuides(); pushHistory(); });

  // transform end
  node.on('transformend', () => { pushHistory(); });

  // double-click to edit text
  if(wrapper.isText){
    node.on('dblclick', ()=> {
      const newText = prompt('Edit text', node.text());
      if(newText !== null){ node.text(newText); mainLayer.batchDraw(); pushHistory(); }
    });
  }
}

// visual polish: small shadow & hover
function addVisualEffects(node){
  node.on('mouseover', ()=> { document.body.style.cursor='move'; node.getLayer().batchDraw(); });
  node.on('mouseout', ()=> { document.body.style.cursor='default'; node.getLayer().batchDraw(); });
  node.cache(); node.filters([]); // cached for performance if needed
}

// selection
let transformer = null;
function selectWrapper(wrapper){
  clearSelection();
  selectedNode = wrapper;
  // show right panel
  propEmpty.style.display = 'none';
  propPanel.hidden = false;
  // setup transformer
  transformer = new Konva.Transformer({ nodes: [wrapper.konva], rotateAnchorOffset: 40, keepRatio:true, boundBoxFunc: (oldBox,newBox)=> newBox });
  mainLayer.add(transformer);
  mainLayer.draw();

  // populate props
  propLock.checked = wrapper.locked || false;
  propRotation.value = wrapper.konva.rotation() || 0;
  propScale.value = wrapper.konva.scaleX() || 1;
  propOpacity.value = wrapper.konva.opacity() || 1;

  // bind prop events
  propLock.onchange = ()=> { wrapper.locked = propLock.checked; wrapper.konva.draggable(!wrapper.locked); pushHistory(); };
  propRotation.oninput = ()=> { wrapper.konva.rotation(Number(propRotation.value)); mainLayer.batchDraw(); };
  propScale.oninput = ()=> { const s = Number(propScale.value); wrapper.konva.scale({x:s,y:s}); mainLayer.batchDraw(); };
  propOpacity.oninput = ()=> { wrapper.konva.opacity(Number(propOpacity.value)); mainLayer.batchDraw(); };
}

// clear selection
function clearSelection(){
  selectedNode = null;
  if(transformer){ transformer.destroy(); transformer = null; }
  propPanel.hidden = true; propEmpty.style.display = 'block';
  hideGuides();
  mainLayer.batchDraw();
}

// delete selected
deleteBtn.addEventListener('click', ()=> {
  if(!selectedNode) return;
  selectedNode.group.destroy();
  const i = wrappers.indexOf(selectedNode);
  if(i>=0) wrappers.splice(i,1);
  clearSelection();
  pushHistory();
});

// duplicate
duplicateBtn.addEventListener('click', ()=> {
  if(!selectedNode) return;
  const sn = selectedNode;
  if(sn.isText){
    addTextNode(sn.konva.text(), { fontFamily: sn.konva.fontFamily(), fontSize: sn.konva.fontSize(), color: sn.konva.fill() });
  }else{
    addImageFromDataURL(sn.imgSrc || sn.konva.image().src, sn.id + '-dup');
  }
});

// bring front / send back
bringFrontBtn.addEventListener('click', ()=> {
  if(selectedNode){ selectedNode.group.moveToTop(); mainLayer.draw(); pushHistory(); }
});
sendBackBtn.addEventListener('click', ()=> {
  if(selectedNode){ selectedNode.group.moveToBottom(); mainLayer.draw(); pushHistory(); }
});

// ---------- Snap & Guides ----------
function doSnap(wrapper){
  const node = wrapper.konva;
  const box = node.getClientRect();
  const guides = [];
  const threshold = 8; // px snap threshold

  // center lines
  const centerX = stage.width()/2;
  const centerY = stage.height()/2;
  if(Math.abs(box.x + box.width/2 - centerX) < threshold){
    node.x(centerX - box.width/2);
    guides.push({ type:'v', pos:centerX });
  }
  if(Math.abs(box.y + box.height/2 - centerY) < threshold){
    node.y(centerY - box.height/2);
    guides.push({ type:'h', pos:centerY });
  }

  // grid snap if visible
  if(gridVisible){
    const step = 50;
    const snappedX = Math.round(node.x()/step)*step;
    const snappedY = Math.round(node.y()/step)*step;
    if(Math.abs(snappedX - node.x()) < threshold) node.x(snappedX);
    if(Math.abs(snappedY - node.y()) < threshold) node.y(snappedY);
  }

  // snap to other objects' edges
  for(const other of wrappers){
    if(other === wrapper) continue;
    const ob = other.konva.getClientRect();
    // left edge
    if(Math.abs(box.x - ob.x) < threshold) { node.x(other.konva.x()); guides.push({type:'v', pos:ob.x}); }
    // right edge
    if(Math.abs(box.x + box.width - (ob.x + ob.width)) < threshold) { node.x(other.konva.x() + other.konva.width() - node.width()); guides.push({type:'v', pos:ob.x + ob.width}); }
    // top edge
    if(Math.abs(box.y - ob.y) < threshold) { node.y(other.konva.y()); guides.push({type:'h', pos:ob.y}); }
    // bottom edge
    if(Math.abs(box.y + box.height - (ob.y + ob.height)) < threshold) { node.y(other.konva.y() + other.konva.height() - node.height()); guides.push({type:'h', pos:ob.y + ob.height}); }
  }

  // show the guides (red lines)
  guideLayer.destroyChildren();
  guides.forEach(g => {
    if(g.type === 'v'){
      guideLayer.add(new Konva.Line({ points:[g.pos,0,g.pos,stage.height()], stroke:'#ef476f', strokeWidth:2, dash:[6,6], listening:false }));
    }else{
      guideLayer.add(new Konva.Line({ points:[0,g.pos,stage.width(),g.pos], stroke:'#ef476f', strokeWidth:2, dash:[6,6], listening:false }));
    }
  });
  guideLayer.batchDraw();
}

function showGuides(wrapper){
  // called during drag; doSnap already populates guideLayer
}
function hideGuides(){
  guideLayer.destroyChildren();
  guideLayer.batchDraw();
}

// ---------- Grid drawing ----------
gridBtn.addEventListener('click', ()=>{
  gridVisible = !gridVisible;
  redrawGrid();
});
function redrawGrid(){
  // remove existing grid
  mainLayer.find('.grid').destroy();
  if(gridVisible){
    const step = 50;
    for(let x=0;x<stage.width();x+=step){
      mainLayer.add(new Konva.Line({ points:[x,0,x,stage.height()], stroke:'#e6eef8', dash:[4,6], opacity:0.14, name:'grid', listening:false }));
    }
    for(let y=0;y<stage.height();y+=step){
      mainLayer.add(new Konva.Line({ points:[0,y,stage.width(),y], stroke:'#e6eef8', dash:[4,6], opacity:0.14, name:'grid', listening:false }));
    }
  }
  mainLayer.batchDraw();
}

// snap toggle
snapBtn.addEventListener('click', ()=>{ snapEnabled = !snapEnabled; snapBtn.classList.toggle('active'); });

// ---------- Upload handling ----------
fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for(const f of files){
    const dataURL = await fileToDataURL(f);
    await addImageFromDataURL(dataURL, f.name);
  }
});

function fileToDataURL(file){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

// ---------- Text tool ----------
textBtn.addEventListener('click', ()=>{
  addTextNode('New Text', { fontFamily:fontFamily.value, fontSize: parseInt(fontSize.value), color: fontColor.value });
});

// apply font/color/size to selected text if any
fontFamily.addEventListener('change', ()=>{ if(selectedNode && selectedNode.isText){ selectedNode.konva.fontFamily(fontFamily.value); mainLayer.draw(); pushHistory(); }});
fontSize.addEventListener('input', ()=>{ if(selectedNode && selectedNode.isText){ selectedNode.konva.fontSize(parseInt(fontSize.value)); mainLayer.draw(); pushHistory(); }});
fontColor.addEventListener('input', ()=>{ if(selectedNode && selectedNode.isText){ selectedNode.konva.fill(fontColor.value); mainLayer.draw(); pushHistory(); }});

// ---------- Undo / Redo (snapshot stack with embedded images) ----------
function pushHistory(){
  // build a serializable snapshot of current objects (not whole Konva JSON, but our compact data)
  const snap = wrappers.map(w => {
    const node = w.konva;
    const base = {
      id: w.id, isText: !!w.isText,
      x: node.x(), y: node.y(),
      scaleX: node.scaleX(), scaleY: node.scaleY(),
      rotation: node.rotation(), opacity: node.opacity()
    };
    if(w.isText){
      base.text = node.text();
      base.fontFamily = node.fontFamily(); base.fontSize = node.fontSize(); base.fill = node.fill();
    }else{
      // serialize image data URL
      base.imgSrc = w.imgSrc || (node.image() && node.image().src) || null;
      base.width = node.width(); base.height = node.height();
    }
    return base;
  });
  // also include stacking order
  const zOrder = wrappers.map(w => w.id);
  const state = { snap, zOrder, dpi: dpiSelect };
  // manage history array
  history = history.slice(0, historyIndex + 1);
  history.push(JSON.stringify(state));
  historyIndex = history.length - 1;
  // cap
  if(history.length > 80) { history.shift(); historyIndex = history.length - 1; }
}

async function restoreStateFromJSON(jsonStr){
  const state = JSON.parse(jsonStr);
  // clear existing
  wrappers.forEach(w => w.group.destroy());
  wrappers.length = 0;
  selectedNode = null;
  mainLayer.destroyChildren();
  mainLayer.add(new Konva.Rect({ x:0,y:0,width: stage.width(), height: stage.height(), fill:'#ffffff', listening:false }));
  // recreate in order
  for(const item of state.snap){
    if(item.isText){
      const w = addTextNode(item.text, { fontFamily: item.fontFamily, fontSize: item.fontSize, color: item.fill });
      w.konva.position({ x: item.x, y: item.y });
      w.konva.scale({ x: item.scaleX, y: item.scaleY });
      w.konva.rotation(item.rotation);
      w.konva.opacity(item.opacity);
    }else{
      if(item.imgSrc){
        const w = await addImageFromDataURL(item.imgSrc);
        w.konva.position({ x: item.x, y: item.y });
        w.konva.width(item.width); w.konva.height(item.height);
        w.konva.scale({ x: item.scaleX, y: item.scaleY });
        w.konva.rotation(item.rotation);
        w.konva.opacity(item.opacity);
      }
    }
  }
  redrawGrid();
  mainLayer.batchDraw();
}

undoBtn.addEventListener('click', ()=> {
  if(historyIndex <= 0) return;
  historyIndex--;
  restoreStateFromJSON(history[historyIndex]);
});
redoBtn.addEventListener('click', ()=> {
  if(historyIndex >= history.length - 1) return;
  historyIndex++;
  restoreStateFromJSON(history[historyIndex]);
});

// keyboard shortcuts
window.addEventListener('keydown', (e)=>{
  const z = (e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='z';
  const y = (e.ctrlKey || e.metaKey) && (e.key.toLowerCase()==='y' || (e.shiftKey && e.key.toLowerCase()==='z'));
  if(z){ e.preventDefault(); undoBtn.click(); }
  if(y){ e.preventDefault(); redoBtn.click(); }
});

// ---------- Trace (prototype) ----------
traceBtn.addEventListener('click', async ()=>{
  if(!selectedNode || selectedNode.isText) return alert('Select an image to trace.');
  // run a simple alpha-based marching squares on original image data (for prototype)
  const src = selectedNode.imgSrc || (selectedNode.konva.image() && selectedNode.konva.image().src);
  if(!src) return alert('No image source available.');
  const pathData = await simpleTracePathFromImage(src, 10);
  // set path on wrapper (find Path shape in group)
  const p = selectedNode.group.findOne('Path');
  if(p){ p.data(pathData); p.visible(true); mainLayer.batchDraw(); pushHistory(); } else {
    const path = new Konva.Path({ data:pathData, stroke:'#ef476f', strokeWidth:6, listening:false, opacity:0.9 });
    selectedNode.group.add(path);
    mainLayer.batchDraw();
    pushHistory();
  }
});

// very small prototype tracer — quick marching squares on an img src (not production grade)
async function simpleTracePathFromImage(src, alphaThreshold=10){
  return new Promise((resolve)=>{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img,0,0);
      const id = ctx.getImageData(0,0,c.width,c.height);
      const w = c.width, h = c.height;
      const mask = new Uint8Array(w*h);
      for(let i=0;i<w*h;i++){ mask[i] = id.data[i*4 + 3] > alphaThreshold ? 1 : 0; }
      // find first pixel
      let start=-1;
      for(let y=0;y<h;y++){ for(let x=0;x<w;x++){ if(mask[y*w+x]){ start=y*w+x; break;} } if(start>=0) break; }
      if(start<0){ resolve(''); return; }
      let sx = start%w, sy=Math.floor(start/w);
      const dirs=[[1,0],[0,1],[-1,0],[0,-1]];
      let x=sx,y=sy,dir=0;
      const pts=[];
      for(let step=0;step<10000;step++){
        pts.push([x,y]);
        let found=false;
        for(let k=0;k<4;k++){
          const nd=(dir+3+k)%4; const nx=x+dirs[nd][0], ny=y+dirs[nd][1];
          if(nx>=0 && nx<w && ny>=0 && ny<h && mask[ny*w+nx]){ x=nx; y=ny; dir=nd; found=true; break; }
        }
        if(!found) break;
        if(x===sx && y===sy) break;
      }
      if(pts.length<3){ resolve(''); return; }
      // convert pts to path scaled to current node size later — but for now return simple path in image px coords
      const path = 'M ' + pts.map(p=>`${p[0]} ${p[1]}`).join(' L ') + ' Z';
      resolve(path);
    };
    img.onerror = ()=> resolve('');
    img.src = src;
  });
}

// ---------- Preview / Export / Print ----------
function openPreview(){
  const dataURL = stage.toDataURL({ pixelRatio: 2 });
  const ctx = previewCanvas.getContext('2d');
  previewCanvas.width = stage.width();
  previewCanvas.height = stage.height();
  const img = new Image();
  img.onload = ()=> { ctx.clearRect(0,0,previewCanvas.width, previewCanvas.height); ctx.drawImage(img, 0, 0); previewModal.style.display='flex'; };
  img.src = dataURL;
}
previewBtn.addEventListener('click', openPreview);
previewBtn2.addEventListener('click', openPreview);
closePreview.addEventListener('click', ()=> previewModal.style.display='none');

downloadPreview.addEventListener('click', ()=> {
  previewCanvas.toBlob(b => saveAs(b, 'kai-stickers-preview.png'));
});

printPreview.addEventListener('click', ()=> {
  const dataURL = previewCanvas.toDataURL();
  const win = window.open('');
  win.document.write('<img src="'+dataURL+'" style="width:100%"/>');
  win.print();
  win.close();
});

// direct export / print from stage
downloadBtn.addEventListener('click', async ()=> {
  const blob = await fetch(stage.toDataURL({ pixelRatio: 2 })).then(r=>r.blob());
  saveAs(blob, 'kai-sticker-sheet.png');
});
exportSvgBtn.addEventListener('click', ()=> {
  // basic SVG embedding (images embedded as data URLs)
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="'+stage.width()+'" height="'+stage.height()+'">'];
  parts.push('<rect width="100%" height="100%" fill="#ffffff"/>');
  for(const w of wrappers){
    if(w.isText){
      // approximate text via foreignObject for simplicity
      const t = w.konva;
      parts.push(`<foreignObject x="${t.x()}" y="${t.y()}" width="${t.width()}" height="${t.height()}"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:${t.fontFamily()};font-size:${t.fontSize()}px;color:${t.fill()}">${t.text()}</div></foreignObject>`);
    }else{
      const img = document.createElement('canvas'); img.width = w.konva.width(); img.height = w.konva.height();
      const ctx = img.getContext('2d'); ctx.drawImage(w.konva.image(), 0, 0, w.konva.width(), w.konva.height());
      const data = img.toDataURL('image/png');
      parts.push(`<image href="${data}" x="${w.konva.x()}" y="${w.konva.y()}" width="${w.konva.width()}" height="${w.konva.height()}"/>`);
    }
    // include cutline path if available
    const p = w.group.findOne('Path');
    if(p){ parts.push(`<path d="${p.data()}" fill="none" stroke="#ef476f" stroke-width="4"/>`); }
  }
  parts.push('</svg>');
  const svgBlob = new Blob([parts.join('\n')], {type:'image/svg+xml;charset=utf-8'});
  saveAs(svgBlob, 'kai-sticker-sheet.svg');
});

printBtn.addEventListener('click', ()=> {
  const dataURL = stage.toDataURL({ pixelRatio: 2 });
  const win = window.open('');
  win.document.write('<img src="'+dataURL+'" style="width:100%"/>');
  win.print();
  win.close();
});

// ---------- Init ----------
(async function init(){
  createStage(defaultDPI);
  // prepopulate history with an empty state
  pushHistory();
  // small UX improvements
  document.querySelectorAll('.preset').forEach(btn => btn.addEventListener('click', ()=> {
    const p = btn.dataset.preset;
    if(p === '3x3') autoArrange(3,3);
    if(p === 'row-6') autoArrange(6,1);
  }));
})();

function autoArrange(cols=3, rows=3){
  const padding = 20;
  const cellW = (stage.width() - padding*(cols+1)) / cols;
  const cellH = (stage.height() - padding*(rows+1)) / rows;
  wrappers.forEach((w,i) => {
    const col = i % cols, row = Math.floor(i/cols) % rows;
    const x = padding + col*(cellW+padding) + (cellW - (w.konva.width()||100))/2;
    const y = padding + row*(cellH+padding) + (cellH - (w.konva.height()||80))/2;
    w.konva.position({ x, y });
  });
  mainLayer.batchDraw();
  pushHistory();
}
