// canvasManager.js
// Handles Konva stage, layers, interactions, tracing glue (calls tracingWorker logic inline here for simplicity)


const stageWidth = 1100, stageHeight = 760;
let stage, layer;
let selection = null;
let showCut = true;


export function initCanvas(){
const parent = document.getElementById('stage-parent');
parent.innerHTML = '';
const s = document.createElement('div'); s.id='stage'; s.style.width='100%'; s.style.height='100%'; parent.appendChild(s);
stage = new Konva.Stage({ container: s, width: stageWidth, height: stageHeight });
layer = new Konva.Layer();
stage.add(layer);


// background
const bg = new Konva.Rect({ x:0,y:0,width:stageWidth,height:stageHeight,fill:'#ffffff' });
layer.add(bg);
layer.draw();


// handle wheel
stage.container().addEventListener('wheel', (e)=>{
const pointer = stage.getPointerPosition();
if(!pointer) return;
const shape = stage.getIntersection(pointer);
if(!shape) return;
const node = findImageWrapperForKonva(shape);
if(!node) return;
e.preventDefault();
const delta = Math.sign(e.deltaY);
const fine = e.shiftKey ? 0.01 : 0.05;
const current = node.group.scaleX();
const newScale = Math.max(0.05, current * (1 - delta * fine));
node.group.scale({x:newScale,y:newScale});
node.scaleX = newScale; node.scaleY = newScale;
layer.batchDraw();
}, {passive:false});
}


// helper to map clicked Konva shape to our wrapper
function findImageWrapperForKonva(shape){
if(!shape) return null;
// traverse up until group with _wrapper
let cur = shape;
while(cur && !cur._wrapper){ cur = cur.getParent(); }
return cur ? cur._wrapper : null;
}


const wrappers = [];


export async function addImageLayer(imgElement, name){
const group = new Konva.Group({ x:50 + wrappers.length*10, y:50 + wra
