// canvasManager.js
export class CanvasManager {
  constructor(containerId) {
    this.stage = new Konva.Stage({
      container: containerId,
      width: 1123,
      height: 794
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    this.history = [];
    this.historyStep = -1;

    this._setupEvents();
  }

  _setupEvents() {
    this.stage.on('click', (e) => {
      if (e.target === this.stage) {
        this.stage.find('Transformer').destroy();
        this.layer.draw();
      } else {
        this._addTransformer(e.target);
      }
    });
  }

  _addTransformer(node) {
    this.stage.find('Transformer').destroy();
    const tr = new Konva.Transformer();
    this.layer.add(tr);
    tr.nodes([node]);
    this.layer.draw();
  }

  addText() {
    const textNode = new Konva.Text({
      text: 'Double-click to edit',
      x: 50,
      y: 50,
      fontSize: 24,
      draggable: true,
    });

    this.layer.add(textNode);
    this._addTransformer(textNode);
    this._saveHistory();

    textNode.on('dblclick dbltap', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.value = textNode.text();
      textarea.style.position = 'absolute';
      textarea.style.left = textNode.x() + 'px';
      textarea.style.top = textNode.y() + 'px';
      textarea.focus();

      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          textNode.text(textarea.value);
          document.body.removeChild(textarea);
          this.layer.draw();
          this._saveHistory();
        }
      });
    });

    this.layer.draw();
  }

  addImage(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const konvaImg = new Konva.Image({
          image: img,
          x: 100,
          y: 100,
          width: img.width / 3,
          height: img.height / 3,
          draggable: true
        });
        this.layer.add(konvaImg);
        this._addTransformer(konvaImg);
        this.layer.draw();
        this._saveHistory();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  addGridPreset() {
    const group = new Konva.Group({ x: 50, y: 50, draggable: true });
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        group.add(new Konva.Rect({
          x: j * 100,
          y: i * 100,
          width: 100,
          height: 100,
          stroke: 'black',
          dash: [4, 4]
        }));
      }
    }
    this.layer.add(group);
    this.layer.draw();
    this._saveHistory();
  }

  addCirclePreset() {
    const group = new Konva.Group({ x: 200, y: 200, draggable: true });
    for (let i = 0; i < 5; i++) {
      group.add(new Konva.Circle({
        x: i * 120,
        y: 0,
        radius: 50,
        stroke: 'black',
        dash: [4, 4]
      }));
    }
    this.layer.add(group);
    this.layer.draw();
    this._saveHistory();
  }

  preview() {
    return this.stage.toDataURL({ pixelRatio: 0.5 });
  }

  downloadPNG() {
    const dataURL = this.stage.toDataURL({ pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'kai-stickers.png';
    a.click();
  }

  downloadPDF() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1123, 794] });
    const dataURL = this.stage.toDataURL({ pixelRatio: 2 });
    pdf.addImage(dataURL, 'PNG', 0, 0, 1123, 794);
    pdf.save('kai-stickers.pdf');
  }

  _saveHistory() {
    this.history = this.history.slice(0, this.historyStep + 1);
    this.history.push(this.stage.toJSON());
    this.historyStep++;
  }

  undo() {
    if (this.historyStep <= 0) return;
    this.historyStep--;
    this.stage = Konva.Node.create(this.history[this.historyStep], this.stage.container());
    this.layer = this.stage.findOne('Layer');
  }

  redo() {
    if (this.historyStep >= this.history.length - 1) return;
    this.historyStep++;
    this.stage = Konva.Node.create(this.history[this.historyStep], this.stage.container());
    this.layer = this.stage.findOne('Layer');
  }
}
