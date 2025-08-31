// --- Globals ---
const stageWidth = 1123; // A4 Landscape px at 96dpi approx
const stageHeight = 794;

let stage, layer, tr;
let history = [];
let historyStep = -1;
let gridLayer;
let snapTolerance = 10;

function init() {
  stage = new Konva.Stage({
    container: 'container',
    width: stageWidth,
    height: stageHeight,
    draggable: false,
  });

  layer = new Konva.Layer();
  gridLayer = new Konva.Layer();
  stage.add(gridLayer);
  stage.add(layer);

  tr = new Konva.Transformer();
  layer.add(tr);

  // Fit canvas in UI responsive container
  fitStageIntoParentContainer();

  window.addEventListener('resize', fitStageIntoParentContainer);

  // Deselect when clicking empty space
  stage.on('click', (e) => {
    if (e.target === stage) {
      tr.nodes([]);
      layer.draw();
      document.getElementById("textControls").classList.add("hidden");
    }
  });

  // Add to history
  layer.on('dragend transformend', saveHistory);

  setupUI();
  saveHistory(); // initial
}

function fitStageIntoParentContainer() {
  const container = document.querySelector('#container');
  const containerWidth = container.offsetWidth;
  const scale = containerWidth / stageWidth;
  stage.width(stageWidth * scale);
  stage.height(stageHeight * scale);
  stage.scale({ x: scale, y: scale });
  stage.draw();
}

function setupUI() {
  // Image upload
  document.getElementById('imageUpload').addEventListener('change', (e) => {
    [...e.target.files].forEach(file => {
      const reader = new FileReader();
      reader.onload = () => addImage(reader.result);
      reader.readAsDataURL(file);
    });
  });

  // Add text
  document.getElementById('addTextBtn').addEventListener('click', () => {
    const textNode = new Konva.Text({
      text: 'Double-click to edit',
      x: 50,
      y: 50,
      fontSize: 32,
      fontFamily: 'Arial',
      fill: '#000000',
      draggable: true,
    });

    layer.add(textNode);
    layer.draw();
    saveHistory();

    textNode.on('dblclick', () => {
      const textPosition = textNode.absolutePosition();
      const stageBox = stage.container().getBoundingClientRect();

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      textarea.value = textNode.text();
      textarea.style.position = 'absolute';
      textarea.style.top = stageBox.top + textPosition.y + 'px';
      textarea.style.left = stageBox.left + textPosition.x + 'px';
      textarea.style.fontSize = textNode.fontSize() + 'px';
      textarea.style.border = '1px solid #ccc';
      textarea.style.padding = '2px';
      textarea.style.margin = '0';
      textarea.style.overflow = 'hidden';
      textarea.style.background = 'white';

      textarea.focus();

      textarea.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          textNode.text(textarea.value);
          layer.draw();
          document.body.removeChild(textarea);
          saveHistory();
        }
      });

      textarea.addEventListener('blur', function () {
        textNode.text(textarea.value);
        layer.draw();
        document.body.removeChild(textarea);
        saveHistory();
      });
    });

    textNode.on('click', () => {
      tr.nodes([textNode]);
      showTextControls(textNode);
    });

    textNode.on('dragmove', () => applySnapping(textNode));
  });

  // Grid toggle
  document.getElementById('gridBtn').addEventListener('click', toggleGrid);

  // Undo/Redo
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);

  // Preview
  document.getElementById('previewBtn').addEventListener('click', showPreview);
  document.getElementById('closePreview').addEventListener('click', () => {
    document.getElementById('previewModal').style.display = 'none';
  });

  document.getElementById('confirmDownload').addEventListener('click', downloadImage);
  document.getElementById('confirmPrint').addEventListener('click', printCanvas);

  // Text controls
  document.getElementById('fontFamily').addEventListener('change', updateSelectedText);
  document.getElementById('fontSize').addEventListener('change', updateSelectedText);
  document.getElementById('fontColor').addEventListener('change', updateSelectedText);
}

function addImage(src) {
  Konva.Image.fromURL(src, (imageNode) => {
    imageNode.setAttrs({
      x: stage.width() / 4,
      y: stage.height() / 4,
      width: 200,
      height: 200,
      draggable: true,
    });

    layer.add(imageNode);
    layer.draw();
    saveHistory();

    imageNode.on('click', () => {
      tr.nodes([imageNode]);
      document.getElementById("textControls").classList.add("hidden");
    });

    imageNode.on('dragmove', () => applySnapping(imageNode));
  });
}

// --- Text Controls ---
function showTextControls(textNode) {
  const panel = document.getElementById("textControls");
  panel.classList.remove("hidden");

  document.getElementById("fontFamily").value = textNode.fontFamily();
  document.getElementById("fontSize").value = textNode.fontSize();
  document.getElementById("fontColor").value = textNode.fill();
}

function updateSelectedText() {
  const nodes = tr.nodes();
  if (nodes.length === 1 && nodes[0] instanceof Konva.Text) {
    const textNode = nodes[0];
    textNode.fontFamily(document.getElementById("fontFamily").value);
    textNode.fontSize(parseInt(document.getElementById("fontSize").value));
    textNode.fill(document.getElementById("fontColor").value);
    layer.draw();
    saveHistory();
  }
}

// --- Grid & Snap ---
function toggleGrid() {
  gridLayer.destroyChildren();
  if (!gridLayer.visible()) {
    const gridSize = 50;
    for (let i = 0; i < stageWidth / gridSize; i++) {
      gridLayer.add(new Konva.Line({
        points: [i * gridSize, 0, i * gridSize, stageHeight],
        stroke: '#ddd',
        strokeWidth: 1,
      }));
    }
    for (let j = 0; j < stageHeight / gridSize; j++) {
      gridLayer.add(new Konva.Line({
        points: [0, j * gridSize, stageWidth, j * gridSize],
        stroke: '#ddd',
        strokeWidth: 1,
      }));
    }
    gridLayer.show();
  } else {
    gridLayer.hide();
  }
  gridLayer.draw();
}

function applySnapping(node) {
  const box = node.getClientRect();
  const tolerance = snapTolerance;

  let closestX = null, closestY = null;

  // Snap to stage edges
  if (Math.abs(box.x) < tolerance) closestX = 0;
  if (Math.abs(box.x + box.width - stageWidth) < tolerance) closestX = stageWidth - box.width;

  if (Math.abs(box.y) < tolerance) closestY = 0;
  if (Math.abs(box.y + box.height - stageHeight) < tolerance) closestY = stageHeight - box.height;

  if (closestX !== null) node.x(closestX);
  if (closestY !== null) node.y(closestY);

  layer.batchDraw();
}

// --- Undo/Redo ---
function saveHistory() {
  historyStep++;
  history = history.slice(0, historyStep);
  history.push(stage.toJSON());
}

function undo() {
  if (historyStep > 0) {
    historyStep--;
    stage.destroy();
    stage = Konva.Node.create(history[historyStep], 'container');
    layer = stage.findOne('Layer');
    gridLayer = stage.findOne('Layer');
    tr = new Konva.Transformer();
    layer.add(tr);
    setupUI();
  }
}

function redo() {
  if (historyStep < history.length - 1) {
    historyStep++;
    stage.destroy();
    stage = Konva.Node.create(history[historyStep], 'container');
    layer = stage.findOne('Layer');
    gridLayer = stage.findOne('Layer');
    tr = new Konva.Transformer();
    layer.add(tr);
    setupUI();
  }
}

// --- Preview, Download, Print ---
function showPreview() {
  const modal = document.getElementById('previewModal');
  const previewCanvas = document.getElementById('previewCanvas');
  modal.style.display = 'flex';

  const dataURL = stage.toDataURL({ pixelRatio: 2 });
  const ctx = previewCanvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    previewCanvas.width = img.width;
    previewCanvas.height = img.height;
    ctx.drawImage(img, 0, 0);
  };
  img.src = dataURL;
}

function downloadImage() {
  const dataURL = stage.toDataURL({ pixelRatio: 2 });
  saveAs(dataURL, 'kai_stickers.png');
}

function printCanvas() {
  const dataURL = stage.toDataURL({ pixelRatio: 2 });
  const win = window.open('');
  win.document.write(`<img src="${dataURL}" style="width:100%">`);
  win.print();
  win.close();
}

// --- Init ---
init();
