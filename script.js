// === GLOBALS ===
const width = 794;  // A4 width in px at 96dpi
const height = 1123; // A4 height
let stage = new Konva.Stage({
  container: "container",
  width: width,
  height: height
});

let layer = new Konva.Layer();
stage.add(layer);

let history = [];
let historyStep = -1;
let gridVisible = false;

// === FUNCTIONS ===
function saveHistory() {
  history = history.slice(0, historyStep + 1);
  history.push(layer.toJSON());
  historyStep++;
}

function undo() {
  if (historyStep > 0) {
    historyStep--;
    layer.destroyChildren();
    layer = Konva.Node.create(history[historyStep], 'container').getLayers()[0];
    stage.destroyChildren();
    stage.add(layer);
  }
}

function redo() {
  if (historyStep < history.length - 1) {
    historyStep++;
    layer.destroyChildren();
    layer = Konva.Node.create(history[historyStep], 'container').getLayers()[0];
    stage.destroyChildren();
    stage.add(layer);
  }
}

// Deselect on blank click
stage.on('click', (e) => {
  if (e.target === stage) {
    stage.find('Transformer').destroy();
    layer.draw();
  }
});

// Add transformer on select
function addTransformer(node) {
  stage.find('Transformer').destroy();
  let tr = new Konva.Transformer();
  layer.add(tr);
  tr.nodes([node]);
  layer.draw();
}

// Upload images
document.getElementById("imageUpload").addEventListener("change", (e) => {
  [...e.target.files].forEach(file => {
    let reader = new FileReader();
    reader.onload = () => {
      let img = new Image();
      img.onload = () => {
        let konvaImg = new Konva.Image({
          image: img,
          x: 50,
          y: 50,
          draggable: true
        });
        layer.add(konvaImg);
        addTransformer(konvaImg);
        konvaImg.on('click', () => addTransformer(konvaImg));
        saveHistory();
        layer.draw();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
});

// Add Text
document.getElementById("addTextBtn").addEventListener("click", () => {
  let txt = new Konva.Text({
    text: "New Text",
    x: 100,
    y: 100,
    fontSize: parseInt(document.getElementById("fontSize").value),
    fontFamily: document.getElementById("fontFamily").value,
    fill: document.getElementById("fontColor").value,
    draggable: true
  });
  layer.add(txt);
  addTransformer(txt);
  txt.on('click', () => addTransformer(txt));
  saveHistory();
  layer.draw();
});

// Font controls
document.getElementById("fontFamily").addEventListener("change", () => {
  let trNode = stage.findOne('Transformer');
  if (trNode && trNode.nodes()[0].className === "Text") {
    trNode.nodes()[0].fontFamily(document.getElementById("fontFamily").value);
    layer.draw();
    saveHistory();
  }
});
document.getElementById("fontColor").addEventListener("input", () => {
  let trNode = stage.findOne('Transformer');
  if (trNode && trNode.nodes()[0].className === "Text") {
    trNode.nodes()[0].fill(document.getElementById("fontColor").value);
    layer.draw();
    saveHistory();
  }
});
document.getElementById("fontSize").addEventListener("input", () => {
  let trNode = stage.findOne('Transformer');
  if (trNode && trNode.nodes()[0].className === "Text") {
    trNode.nodes()[0].fontSize(parseInt(document.getElementById("fontSize").value));
    layer.draw();
    saveHistory();
  }
});

// Gridlines
document.getElementById("gridBtn").addEventListener("click", () => {
  gridVisible = !gridVisible;
  drawGrid();
});

function drawGrid() {
  layer.find('.gridLine').destroy();
  if (gridVisible) {
    let step = 50;
    for (let i = 0; i < width; i += step) {
      layer.add(new Konva.Line({
        points: [i, 0, i, height],
        stroke: '#ddd',
        dash: [4, 4],
        name: 'gridLine'
      }));
    }
    for (let j = 0; j < height; j += step) {
      layer.add(new Konva.Line({
        points: [0, j, width, j],
        stroke: '#ddd',
        dash: [4, 4],
        name: 'gridLine'
      }));
    }
  }
  layer.batchDraw();
}

// Preview
document.getElementById("previewBtn").addEventListener("click", () => {
  let modal = document.getElementById("previewModal");
  modal.style.display = "block";
  let previewCanvas = document.getElementById("previewCanvas");
  previewCanvas.width = width;
  previewCanvas.height = height;
  let ctx = previewCanvas.getContext("2d");
  let dataURL = stage.toDataURL({ pixelRatio: 2 });
  let img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0, width, height);
  img.src = dataURL;
});

document.getElementById("closePreview").addEventListener("click", () => {
  document.getElementById("previewModal").style.display = "none";
});

// Download
document.getElementById("confirmDownload").addEventListener("click", () => {
  stage.toCanvas().toBlob(blob => saveAs(blob, "stickers.png"));
});

// Print
document.getElementById("confirmPrint").addEventListener("click", () => {
  let win = window.open("");
  let img = new Image();
  img.src = stage.toDataURL({ pixelRatio: 2 });
  img.onload = () => {
    win.document.write("<img src='" + img.src + "' style='width:100%'>");
    win.print();
    win.close();
  };
});

// Undo/Redo
document.getElementById("undoBtn").addEventListener("click", undo);
document.getElementById("redoBtn").addEventListener("click", redo);

// Init save
saveHistory();
