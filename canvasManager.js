// === canvasManager.js ===
// Handles Konva stage, snapping, presets, undo/redo, and clipping

let stage, layer;
let history = [];
let historyStep = -1;

const stageWidth = 1123;
const stageHeight = 794;
const stageRatio = stageWidth / stageHeight;

const transformer = new Konva.Transformer({
  rotateEnabled: true,
  enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  boundBoxFunc: (oldBox, newBox) => {
    if (newBox.width < 20 || newBox.height < 20) return oldBox;
    return newBox;
  }
});

function initStage(containerId) {
  stage = new Konva.Stage({
    container: containerId,
    width: stageWidth,
    height: stageHeight
  });

  layer = new Konva.Layer();
  stage.add(layer);
  layer.add(transformer);

  // Save initial state
  saveHistory();

  // Deselect transformer when clicking empty space
  stage.on('click', (e) => {
    if (e.target === stage) {
      transformer.nodes([]);
      updateToolbar(null);
    }
  });

  setupShortcuts();
}

function addImage(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    Konva.Image.fromURL(e.target.result, (imageNode) => {
      imageNode.setAttrs({
        x: stage.width() / 2 - 100,
        y: stage.height() / 2 - 100,
        width: 200,
        height: 200,
        draggable: true
      });

      addTransformHandlers(imageNode);
      layer.add(imageNode);
      layer.batchDraw();
      saveHistory();
    });
  };
  reader.readAsDataURL(file);
}

function addText(text = "Double-click to edit") {
  const textNode = new Konva.Text({
    text: text,
    x: stage.width() / 2 - 100,
    y: stage.height() / 2,
    fontSize: 24,
    fontFamily: 'Arial',
    fill: '#000',
    draggable: true
  });

  addTransformHandlers(textNode);

  textNode.on('dblclick', () => {
    const newText = prompt("Edit text:", textNode.text());
    if (newText !== null) {
      textNode.text(newText);
      saveHistory();
    }
  });

  layer.add(textNode);
  layer.batchDraw();
  saveHistory();
}

function addPreset(type) {
  let preset;

  switch (type) {
    case 'circle':
      preset = new Konva.Circle({
        x: stage.width() / 2,
        y: stage.height() / 2,
        radius: 100,
        stroke: 'black',
        strokeWidth: 2,
        draggable: true,
        name: 'preset'
      });
      break;

    case 'grid':
      preset = new Konva.Rect({
        x: stage.width() / 2 - 150,
        y: stage.height() / 2 - 100,
        width: 300,
        height: 200,
        stroke: 'black',
        strokeWidth: 2,
        draggable: true,
        name: 'preset'
      });
      break;

    default: // rectangle
      preset = new Konva.Rect({
        x: stage.width() / 2 - 100,
        y: stage.height() / 2 - 75,
        width: 200,
        height: 150,
        stroke: 'black',
        strokeWidth: 2,
        draggable: true,
        name: 'preset'
      });
  }

  layer.add(preset);
  layer.batchDraw();
  saveHistory();
}

// === Snapping into Presets ===
function snapImageToPreset(imageNode, presetNode) {
  const presetBox = presetNode.getClientRect();
  const imageBox = imageNode.getClientRect();

  imageNode.position({
    x: presetBox.x,
    y: presetBox.y
  });

  imageNode.setAttrs({
    width: presetBox.width,
    height: presetBox.height
  });

  // Clip inside preset
  const group = new Konva.Group({
    clipFunc: function(ctx) {
      if (presetNode.className === 'Circle') {
        ctx.arc(presetNode.x(), presetNode.y(), presetNode.radius(), 0, Math.PI * 2, false);
      } else {
        ctx.rect(presetNode.x(), presetNode.y(), presetNode.width(), presetNode.height());
      }
    },
    draggable: true
  });

  presetNode.remove();
  group.add(presetNode);
  group.add(imageNode);
  layer.add(group);
  layer.batchDraw();
  saveHistory();
}

// === Toolbar Updates ===
function addTransformHandlers(node) {
  node.on('click', () => {
    transformer.nodes([node]);
    updateToolbar(node);
  });
  node.on('dragend transformend', () => {
    saveHistory();
  });
}

// === Undo / Redo ===
function saveHistory() {
  history = history.slice(0, historyStep + 1);
  history.push(stage.toJSON());
  historyStep++;
}

function undo() {
  if (historyStep > 0) {
    historyStep--;
    loadHistory();
  }
}

function redo() {
  if (historyStep < history.length - 1) {
    historyStep++;
    loadHistory();
  }
}

function loadHistory() {
  stage.destroyChildren();
  layer = Konva.Node.create(history[historyStep], stage);
  stage.add(layer);
  layer.add(transformer);
  layer.draw();
}

// === Keyboard Shortcuts ===
function setupShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
      undo();
    }
    if (e.ctrlKey && e.key === 'y') {
      redo();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const selected = transformer.nodes()[0];
      if (selected) {
        selected.destroy();
        transformer.nodes([]);
        layer.draw();
        saveHistory();
      }
    }
  });
}

// === Exports ===
window.CanvasManager = {
  initStage,
  addImage,
  addText,
  addPreset,
  undo,
  redo,
  snapImageToPreset
};
