// canvasManager.js
export class CanvasManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.stage = new Konva.Stage({
            container: containerId,
            width: window.innerWidth,
            height: window.innerHeight - 100, // Adjust for toolbar
        });
        this.layer = new Konva.Layer();
        this.gridLayer = new Konva.Layer();
        this.stage.add(this.gridLayer);
        this.stage.add(this.layer);

        // A4 landscape: 297mm x 210mm at 96dpi ~ 1123x794px
        this.canvasWidth = 1123;
        this.canvasHeight = 794;
        this.scale = 1;
        this.history = [];
        this.historyIndex = -1;
        this.selectedNodes = [];
        this.tr = new Konva.Transformer({
            anchorStroke: 'blue',
            anchorFill: 'white',
            anchorSize: 10,
            borderStroke: 'blue',
            borderDash: [3, 3],
        });
        this.layer.add(this.tr);
        this.gridSize = 20;
        this.drawGrid();

        // Events
        this.stage.on('click tap', (e) => this.handleSelect(e));
        window.addEventListener('resize', () => this.fitStage());
        this.stage.on('wheel', (e) => this.handleZoom(e));
        this.stage.draggable(true); // For pan

        this.saveState();
        this.fitStage();
    }

    drawGrid() {
        this.gridLayer.removeChildren();
        for (let i = 0; i < this.canvasWidth / this.gridSize; i++) {
            this.gridLayer.add(new Konva.Line({
                points: [i * this.gridSize, 0, i * this.gridSize, this.canvasHeight],
                stroke: '#ddd',
                strokeWidth: 1,
            }));
        }
        for (let i = 0; i < this.canvasHeight / this.gridSize; i++) {
            this.gridLayer.add(new Konva.Line({
                points: [0, i * this.gridSize, this.canvasWidth, i * this.gridSize],
                stroke: '#ddd',
                strokeWidth: 1,
            }));
        }
        this.gridLayer.batchDraw();
    }

    handleZoom(e) {
        e.evt.preventDefault();
        const scaleBy = 1.05;
        const oldScale = this.stage.scaleX();
        const pointer = this.stage.getPointerPosition();
        const mousePointTo = {
            x: (pointer.x - this.stage.x()) / oldScale,
            y: (pointer.y - this.stage.y()) / oldScale,
        };
        const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
        this.stage.scale({ x: newScale, y: newScale });
        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };
        this.stage.position(newPos);
        this.stage.batchDraw();
    }

    fitStage() {
        this.stage.width(window.innerWidth);
        this.stage.height(window.innerHeight - 100);
        this.stage.batchDraw();
    }

    addImage(src) {
        Konva.Image.fromURL(src, (img) => {
            img.setAttrs({
                x: 50,
                y: 50,
                scaleX: 1,
                scaleY: 1,
                draggable: true,
            });
            img.on('dragmove', () => this.snapToGrid(img));
            this.layer.add(img);
            this.layer.draw();
            this.saveState();
        });
    }

    addText(text = 'Edit me') {
        const textNode = new Konva.Text({
            text,
            x: 50,
            y: 50,
            fontSize: 24,
            fontFamily: 'Roboto',
            fill: '#000',
            draggable: true,
        });
        textNode.on('dragmove', () => this.snapToGrid(textNode));
        textNode.on('dblclick dbltap', () => this.editText(textNode));
        this.layer.add(textNode);
        this.layer.draw();
        this.saveState();
        return textNode;
    }

    editText(textNode) {
        const textPosition = textNode.absolutePosition();
        const stageBox = this.stage.container().getBoundingClientRect();
        const areaPosition = {
            x: stageBox.left + textPosition.x,
            y: stageBox.top + textPosition.y,
        };
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        textarea.value = textNode.text();
        textarea.style.position = 'absolute';
        textarea.style.top = areaPosition.y + 'px';
        textarea.style.left = areaPosition.x + 'px';
        textarea.style.width = textNode.width() + 'px';
        textarea.style.height = textNode.height() + 'px';
        textarea.style.fontSize = textNode.fontSize() + 'px';
        textarea.style.border = 'none';
        textarea.style.padding = '0px';
        textarea.style.margin = '0px';
        textarea.style.overflow = 'hidden';
        textarea.style.background = 'none';
        textarea.style.outline = 'none';
        textarea.style.resize = 'none';
        textarea.style.lineHeight = textNode.lineHeight();
        textarea.style.fontFamily = textNode.fontFamily();
        textarea.style.transformOrigin = 'left top';
        textarea.style.textAlign = textNode.align();
        textarea.style.color = textNode.fill();
        textarea.focus();

        textarea.addEventListener('keydown', (e) => {
            if (e.keyCode === 13) {
                textNode.text(textarea.value);
                document.body.removeChild(textarea);
                this.layer.draw();
                this.saveState();
            }
        });
    }

    snapToGrid(node) {
        const x = Math.round(node.x() / this.gridSize) * this.gridSize;
        const y = Math.round(node.y() / this.gridSize) * this.gridSize;
        node.position({ x, y });
        this.layer.batchDraw();
    }

    addPreset(type) {
        let preset;
        if (type === 'grid') {
            preset = new Konva.Group({ x: 50, y: 50, draggable: true });
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    preset.add(new Konva.Rect({
                        x: i * 100,
                        y: j * 100,
                        width: 100,
                        height: 100,
                        stroke: 'black',
                    }));
                }
            }
        } else if (type === 'circle') {
            preset = new Konva.Circle({
                x: 150,
                y: 150,
                radius: 100,
                fill: 'transparent',
                stroke: 'black',
                draggable: true,
            });
        } else if (type === 'label') {
            preset = new Konva.Label({
                x: 50,
                y: 50,
                draggable: true,
            });
            preset.add(new Konva.Tag({ fill: 'yellow' }));
            preset.add(new Konva.Text({ text: 'Label', padding: 5 }));
        }
        if (preset) {
            preset.on('dragmove', () => this.snapToGrid(preset));
            this.layer.add(preset);
            this.layer.draw();
            this.saveState();
        }
    }

    handleSelect(e) {
        if (e.target === this.stage) {
            this.tr.nodes([]);
            this.selectedNodes = [];
            document.getElementById('propertiesPanel').style.display = 'none';
        } else {
            this.tr.nodes([e.target]);
            this.selectedNodes = [e.target];
            if (e.target instanceof Konva.Text) {
                document.getElementById('propertiesPanel').style.display = 'block';
                document.getElementById('fontFamily').value = e.target.fontFamily();
                document.getElementById('fontSize').value = e.target.fontSize();
                document.getElementById('fillColor').value = e.target.fill();
            } else {
                document.getElementById('propertiesPanel').style.display = 'none';
            }
        }
        this.layer.draw();
    }

    updateTextProperty(prop, value) {
        if (this.selectedNodes[0] instanceof Konva.Text) {
            const text = this.selectedNodes[0];
            if (prop === 'fontFamily') text.fontFamily(value);
            if (prop === 'fontSize') text.fontSize(parseInt(value));
            if (prop === 'fill') text.fill(value);
            if (prop === 'bold') text.fontStyle(text.fontStyle() === 'bold' ? 'normal' : 'bold');
            if (prop === 'italic') text.fontStyle(text.fontStyle() === 'italic' ? 'normal' : 'italic');
            if (prop === 'underline') text.textDecoration(text.textDecoration() === 'underline' ? '' : 'underline');
            this.layer.draw();
            this.saveState();
        }
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.loadState(this.history[this.historyIndex]);
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.loadState(this.history[this.historyIndex]);
        }
    }

    saveState() {
        this.history = this.history.slice(0, this.historyIndex + 1);
        const json = this.stage.toJSON();
        this.history.push(json);
        this.historyIndex++;
    }

    loadState(json) {
        this.stage.destroyChildren();
        const node = Konva.Node.create(json, this.containerId);
        this.stage = node;
        this.layer = this.stage.getChildren()[1]; // Assuming order
        this.gridLayer = this.stage.getChildren()[0];
        this.tr = new Konva.Transformer();
        this.layer.add(this.tr);
        this.stage.draw();
    }

    getPreviewStage() {
        const previewStage = new Konva.Stage({
            container: 'previewContainer',
            width: this.canvasWidth / 2,
            height: this.canvasHeight / 2,
        });
        const previewLayer = this.layer.clone();
        previewStage.add(previewLayer);
        previewStage.scale({ x: 0.5, y: 0.5 });
        previewStage.draw();
        return previewStage;
    }

    exportToPNG() {
        const dataURL = this.stage.toDataURL({ pixelRatio: 2 });
        saveAs(new Blob([dataURL]), 'kai-sticker.png');
    }

    exportToPDF() {
        const pdf = new jspdf.jsPDF({ orientation: 'landscape', unit: 'px', format: [this.canvasWidth, this.canvasHeight] });
        const dataURL = this.stage.toDataURL({ pixelRatio: 2 });
        pdf.addImage(dataURL, 'PNG', 0, 0, this.canvasWidth, this.canvasHeight);
        pdf.save('kai-sticker.pdf');
    }

    print() {
        const dataURL = this.stage.toDataURL({ pixelRatio: 2 });
        const win = window.open();
        win.document.write('<img src="' + dataURL + '" onload="window.print();window.close()" />');
    }

    saveProject() {
        const json = this.stage.toJSON();
        const blob = new Blob([json], { type: 'application/json' });
        saveAs(blob, 'kai-project.json');
    }

    loadProject(json) {
        this.loadState(json);
        this.saveState();
    }

    handleKeyboard(e) {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') this.undo();
            if (e.key === 'y') this.redo();
            if (e.key === 's') {
                e.preventDefault();
                this.saveProject();
            }
            if (e.key === 'c') this.copy();
            if (e.key === 'v') this.paste();
            if (e.key === 'd') this.duplicate();
            if (e.key === 'g') this.group();
        }
        if (e.key === 'Delete') this.deleteSelected();
        if (e.key.startsWith('Arrow')) this.nudge(e.key);
    }

    copy() {
        if (this.selectedNodes.length) {
            this.clipboard = this.selectedNodes[0].clone();
        }
    }

    paste() {
        if (this.clipboard) {
            const clone = this.clipboard.clone({ x: this.clipboard.x() + 10, y: this.clipboard.y() + 10 });
            this.layer.add(clone);
            this.layer.draw();
            this.saveState();
        }
    }

    duplicate() {
        this.copy();
        this.paste();
    }

    deleteSelected() {
        this.selectedNodes.forEach(node => node.destroy());
        this.tr.nodes([]);
        this.layer.draw();
        this.saveState();
    }

    nudge(direction) {
        const amount = 1;
        this.selectedNodes.forEach(node => {
            if (direction === 'ArrowUp') node.y(node.y() - amount);
            if (direction === 'ArrowDown') node.y(node.y() + amount);
            if (direction === 'ArrowLeft') node.x(node.x() - amount);
            if (direction === 'ArrowRight') node.x(node.x() + amount);
        });
        this.layer.draw();
        this.saveState();
    }

    group() {
        if (this.selectedNodes.length > 1) {
            const group = new Konva.Group({ draggable: true });
            this.selectedNodes.forEach(node => group.add(node));
            this.layer.add(group);
            this.tr.nodes([group]);
            this.selectedNodes = [group];
            this.layer.draw();
            this.saveState();
        }
    }

    ungroup() {
        if (this.selectedNodes[0] instanceof Konva.Group) {
            const group = this.selectedNodes[0];
            group.getChildren().forEach(child => this.layer.add(child));
            group.destroy();
            this.tr.nodes([]);
            this.layer.draw();
            this.saveState();
        }
    }
}
