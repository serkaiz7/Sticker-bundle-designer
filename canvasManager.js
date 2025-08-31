// canvasManager.js
class CanvasManager {
  constructor(containerId) {
    this.stage = new Konva.Stage({
      container: containerId,
      width: 1123,
      height: 794
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    // Add grid toggle
    this.gridLayer = new Konva.Layer();
    this.stage.add(this.gridLayer);

    this.history = [];
    this.future = [];
  }

  addImage(img) {
    const konvaImage = new Konva.Image({
      image: img,
      x: 50,
      y: 50,
      draggable: true
    });

    this.layer.add(konvaImage);
    this.layer.draw();
    this.saveHistory();
  }

  addText(text = "Edit Me") {
    const konvaText = new Konva.Text({
      text: text,
      x: 100,
      y: 100,
      fontSize: 24,
      fontFamily: 'Inter',
      fill: 'black',
      draggable: true
    });

    this.layer.add(konvaText);
    this.layer.draw();
    this.saveHistory();
  }

  toggleGrid() {
    this.gridLayer.destroyChildren();
    const spacing = 50;
    for (let i = 0; i < this.stage.width() / spacing; i++) {
      this.gridLayer.add(new Konva.Line({
        points: [i * spacing, 0, i * spacing, this.stage.height()],
        stroke: '#ddd',
        strokeWidth: 1
      }));
    }
    for (let j = 0; j < this.stage.height() / spacing; j++) {
      this.gridLayer.add(new Konva.Line({
        points: [0, j * spacing, this.stage.width(), j * spacing],
        stroke: '#ddd',
        strokeWidth: 1
      }));
    }
    this.gridLayer.visible(!this.gridLayer.visible());
    this.stage.draw();
  }

  saveHistory() {
    const json = this.stage.toJSON();
    this.history.push(json);
  }

  undo() {
    if (this.history.length > 1) {
      this.future.push(this.history.pop());
      const last = this.history[this.history.length - 1];
      this.stage.destroyChildren();
      Konva.Node.create(last, this.stage);
    }
  }

  redo() {
    if (this.future.length > 0) {
      const next = this.future.pop();
      this.history.push(next);
      this.stage.destroyChildren();
      Konva.Node.create(next, this.stage);
    }
  }
}
