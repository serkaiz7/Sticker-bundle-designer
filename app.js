/**
 * Manages all Konva canvas operations, including object creation,
 * manipulation, history (undo/redo), and exporting.
 */
export class CanvasManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.stage = null;
        this.layer = null;
        this.gridLayer = null;
        this.tr = null;
        this.history = [];
        this.historyIndex = -1;
        this.selectedNodes = [];
        this.clipboard = null;
        this.gridSize = 20;

        // DPI for print calculations
        this.DPI = 96; 

        // Canvas size presets in inches or pixels
        this.canvasSizes = {
            'a4': { width: 11.69, height: 8.27 },
            'letter': { width: 11, height: 8.5 },
            'legal': { width: 14, height: 8.5 },
            'tabloid': { width: 17, height: 11 },
            '1920x1080': { isPx: true, width: 1920, height: 1080 },
            '1280x720': { isPx: true, width: 1280, height: 720 },
        };
        
        // Initial setup
        this.setCanvasSize('a4');
    }

    /**
     * Initializes or re-initializes the Konva stage with given dimensions.
     * @param {number} width - The width of the stage in pixels.
     * @param {number} height - The height of the stage in pixels.
     */
    initStage(width, height) {
        if(this.stage) this.stage.destroy();
        this.stage = new Konva.Stage({ container: this.containerId, width: width, height: height });
        this.stage.container().style.backgroundColor = document.body.classList.contains('dark') ? '#3a3f44' : 'white';
        this.layer = new Konva.Layer();
        this.gridLayer = new Konva.Layer();
        this.stage.add(this.gridLayer, this.layer);
        this.tr = new Konva.Transformer({ anchorStroke: '#4a90e2', anchorFill: 'white', anchorSize: 10, borderStroke: '#4a90e2', borderDash: [4, 4], rotateAnchorOffset: 30, keepRatio: false });
        this.layer.add(this.tr);
        this.drawGrid();
        
        // Event Listeners
        this.stage.on('click tap', (e) => this.handleSelect(e));
        this.stage.on('mousedown', (e) => { if (e.evt.button === 1) { this.stage.draggable(true); this.stage.container().style.cursor = 'grabbing'; } });
        this.stage.on('mouseup', (e) => { if (e.evt.button === 1) { this.stage.draggable(false); this.stage.container().style.cursor = 'default'; } });
        this.saveState();
    }
    
    /**
     * Sets the canvas size based on a preset key.
     * @param {string} sizeKey - The key for the desired size (e.g., 'a4').
     */
    setCanvasSize(sizeKey) {
        const size = this.canvasSizes[sizeKey];
        let width = size.isPx ? size.width : size.width * this.DPI;
        let height = size.isPx ? size.height : size.height * this.DPI;
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.initStage(width, height);
    }

    /**
     * Draws a grid on the grid layer.
     */
    drawGrid() {
        this.gridLayer.destroyChildren();
        const stroke = document.body.classList.contains('dark') ? '#495057' : '#e9ecef';
        for (let i = 0; i < this.canvasWidth / this.gridSize; i++) { this.gridLayer.add(new Konva.Line({ points: [Math.round(i * this.gridSize) + 0.5, 0, Math.round(i * this.gridSize) + 0.5, this.canvasHeight], stroke: stroke, strokeWidth: 1, })); }
        for (let j = 0; j < this.canvasHeight / this.gridSize; j++) { this.gridLayer.add(new Konva.Line({ points: [0, Math.round(j * this.gridSize) + 0.5, this.canvasWidth, Math.round(j * this.gridSize) + 0.5], stroke: stroke, strokeWidth: 1, })); }
        this.gridLayer.batchDraw();
    }

    /**
     * Adds an image to the canvas from a data URL.
     * @param {string} src - The data URL of the image.
     * @param {number} [index=0] - An index to offset multiple images.
     */
    addImage(src, index = 0) {
        Konva.Image.fromURL(src, (img) => {
            img.setAttrs({ x: 50 + index * 20, y: 50 + index * 20, draggable: true, });
            const maxDim = Math.min(this.canvasWidth, this.canvasHeight) * 0.4;
            const scale = maxDim / Math.max(img.width(), img.height());
            if (scale < 1) img.scale({ x: scale, y: scale });
            img.on('dragmove', () => this.snapToGrid(img));
            img.on('dragend', () => this.saveState());
            img.on('transformend', () => this.saveState());
            this.layer.add(img);
            this.saveState();
        });
    }

    /**
     * Adds a new text node to the canvas.
     * @param {string} [text='Double-click to edit'] - The initial text.
     * @returns {Konva.Text} The created text node.
     */
    addText(text = 'Double-click to edit') {
        const textNode = new Konva.Text({ text, x: 50, y: 50, fontSize: 32, fontFamily: 'Inter', fill: document.body.classList.contains('dark') ? '#e9ecef' : '#212529', draggable: true, });
        textNode.on('dragmove', () => this.snapToGrid(textNode));
        textNode.on('dragend', () => this.saveState());
        textNode.on('transformend', () => this.saveState());
        textNode.on('dblclick dbltap', () => this.editText(textNode));
        this.layer.add(textNode);
        this.saveState();
        return textNode;
    }

    /**
     * Creates a textarea over a text node for in-place editing.
     * @param {Konva.Text} textNode - The text node to edit.
     */
    editText(textNode) {
        textNode.hide(); this.tr.hide(); this.layer.draw();
        const textPosition = textNode.absolutePosition();
        const stageBox = this.stage.container().getBoundingClientRect();
        const areaPosition = { x: stageBox.left + textPosition.x, y: stageBox.top + textPosition.y, };
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        Object.assign(textarea.style, { position: 'absolute', top: areaPosition.y + 'px', left: areaPosition.x + 'px', width: textNode.width() * textNode.scaleX() + 'px', height: textNode.height() * textNode.scaleY() + 'px', fontSize: textNode.fontSize() * textNode.scaleY() + 'px', border: '1px solid #4a90e2', padding: '0px', margin: '0px', overflow: 'hidden', background: 'white', outline: 'none', resize: 'none', lineHeight: textNode.lineHeight(), fontFamily: textNode.fontFamily(), transformOrigin: 'left top', transform: `rotateZ(${textNode.rotation()}deg)`, textAlign: textNode.align(), color: textNode.fill(), zIndex: 1001, });
        textarea.value = textNode.text();
        textarea.focus();
        const removeTextarea = () => { if(document.body.contains(textarea)) { textNode.text(textarea.value); textNode.show(); this.tr.show(); this.layer.draw(); this.saveState(); document.body.removeChild(textarea); window.removeEventListener('click', handleOutsideClick); } };
        const boundRemove = removeTextarea.bind(this);
        textarea.addEventListener('keydown', (e) => { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) boundRemove(); });
        const handleOutsideClick = (e) => { if (e.target !== textarea) boundRemove(); };
        setTimeout(() => window.addEventListener('click', handleOutsideClick), 0);
    }

    /**
     * Snaps a node to the grid.
     * @param {Konva.Node} node - The node to snap.
     */
    snapToGrid(node) {
        node.position({ x: Math.round(node.x() / this.gridSize) * this.gridSize, y: Math.round(node.y() / this.gridSize) * this.gridSize });
        this.layer.batchDraw();
    }

    /**
     * Adds a preset shape to the canvas.
     * @param {string} type - The type of preset ('rectangle', 'circle').
     */
    addPreset(type) {
        let preset;
        if (type === 'rectangle') { preset = new Konva.Rect({ x: 50, y: 50, width: 200, height: 100, fill: '#ddd', stroke: '#555', strokeWidth: 2, draggable: true }); } 
        else if (type === 'circle') { preset = new Konva.Circle({ x: 150, y: 150, radius: 70, fill: '#ddd', stroke: '#555', strokeWidth: 2, draggable: true }); }
        if (preset) { preset.on('dragmove', () => this.snapToGrid(preset)); preset.on('dragend', () => this.saveState()); preset.on('transformend', () => this.saveState()); this.layer.add(preset); this.saveState(); }
    }

    /**
     * Handles node selection and transformer updates.
     * @param {object} e - The Konva event object.
     */
    handleSelect(e) {
        if (e.target === this.stage) { this.tr.nodes([]); this.selectedNodes = []; this.updatePropertiesPanel(); return; }
        const metaPressed = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
        const isSelected = this.tr.nodes().indexOf(e.target) >= 0;
        if (!metaPressed && !isSelected) { this.tr.nodes([e.target]); } 
        else if (metaPressed && isSelected) { const nodes = this.tr.nodes().slice(); nodes.splice(nodes.indexOf(e.target), 1); this.tr.nodes(nodes); } 
        else if (metaPressed && !isSelected) { const nodes = this.tr.nodes().concat([e.target]); this.tr.nodes(nodes); }
        this.selectedNodes = this.tr.nodes();
        this.updatePropertiesPanel();
    }

    /**
     * Updates the properties panel based on the current selection.
     */
    updatePropertiesPanel() {
        const propertiesPanel = document.getElementById('propertiesPanel');
        const textProperties = document.getElementById('text-properties');
        const aiTextProperties = document.getElementById('ai-text-properties');
        if (this.selectedNodes.length === 1 && this.selectedNodes[0] instanceof Konva.Text) {
            const textNode = this.selectedNodes[0];
            propertiesPanel.style.display = 'block';
            textProperties.style.display = 'block';
            aiTextProperties.style.display = 'block';
            document.getElementById('fontFamily').value = textNode.fontFamily();
            document.getElementById('fontSize').value = textNode.fontSize();
            document.getElementById('fillColor').value = textNode.fill();
        } else {
            propertiesPanel.style.display = 'none';
            textProperties.style.display = 'none';
            aiTextProperties.style.display = 'none';
        }
    }

    /**
     * Updates a property of the selected text node.
     * @param {string} prop - The property to update.
     * @param {string|number} value - The new value.
     */
    updateTextProperty(prop, value) {
        if (this.selectedNodes.length === 1 && this.selectedNodes[0] instanceof Konva.Text) {
            const textNode = this.selectedNodes[0];
            let fontStyle = textNode.fontStyle() || '';
            if (prop === 'fontFamily') textNode.fontFamily(value);
            if (prop === 'fontSize') textNode.fontSize(parseInt(value));
            if (prop === 'fill') textNode.fill(value);
            if (prop === 'bold') { fontStyle = fontStyle.includes('bold') ? fontStyle.replace('bold', '').trim() : `bold ${fontStyle}`.trim(); }
            if (prop === 'italic') { fontStyle = fontStyle.includes('italic') ? fontStyle.replace('italic', '').trim() : `italic ${fontStyle}`.trim(); }
            if (prop === 'underline') { textNode.textDecoration(textNode.textDecoration() === 'underline' ? '' : 'underline'); }
            textNode.fontStyle(fontStyle);
            this.layer.batchDraw(); this.saveState();
        }
    }

    /**
     * Updates the content of the selected text node.
     * @param {string} newText - The new text content.
     */
    updateTextContent(newText) {
        if (this.selectedNodes.length === 1 && this.selectedNodes[0] instanceof Konva.Text) {
            this.selectedNodes[0].text(newText);
            this.layer.batchDraw(); this.saveState();
        }
    }
    
    // History management
    undo() { if (this.historyIndex > 0) { this.historyIndex--; this.loadState(this.history[this.historyIndex]); } }
    redo() { if (this.historyIndex < this.history.length - 1) { this.historyIndex++; this.loadState(this.history[this.historyIndex]); } }
    saveState() { this.history = this.history.slice(0, this.historyIndex + 1); this.history.push(this.stage.toJSON()); this.historyIndex++; }

    loadState(jsonString) {
        this.stage.destroy();
        this.stage = Konva.Node.create(jsonString, this.containerId);
        this.layer = this.stage.findOne('Layer');
        this.gridLayer = this.stage.getChildren(c => c !== this.layer)[0];
        this.tr = new Konva.Transformer({ anchorStroke: '#4a90e2', anchorFill: 'white', anchorSize: 10, borderStroke: '#4a90e2', borderDash: [4, 4], rotateAnchorOffset: 30, keepRatio: false });
        this.layer.add(this.tr);
        this.stage.draw();
    }

    // Export and save functionality
    getPreviewDataURL() { this.tr.hide(); this.gridLayer.hide(); const dataURL = this.stage.toDataURL({ pixelRatio: 2 }); this.tr.show(); this.gridLayer.show(); return dataURL; }
    exportToPNG() { saveAs(this.getPreviewDataURL(), 'design.png'); }
    exportToPDF() { const pdf = new jspdf.jsPDF({ orientation: this.canvasWidth > this.canvasHeight ? 'landscape' : 'portrait', unit: 'px', format: [this.canvasWidth, this.canvasHeight] }); pdf.addImage(this.getPreviewDataURL(), 'PNG', 0, 0, this.canvasWidth, this.canvasHeight); pdf.save('design.pdf'); }
    saveProject() { saveAs(new Blob([this.stage.toJSON()], { type: 'application/json' }), 'design-project.json'); }
    loadProject(jsonString) { this.loadState(jsonString); this.saveState(); }
    
    // Object manipulation
    deleteSelected() { this.selectedNodes.forEach(node => node.destroy()); this.tr.nodes([]); this.layer.draw(); this.saveState(); }
    
    group() {
        if (this.selectedNodes.length > 1) {
            const group = new Konva.Group({ draggable: true }); const box = Konva.Util.getClientRect(this.selectedNodes);
            group.position({ x: box.x, y: box.y });
            this.selectedNodes.forEach(node => { node.moveTo(group); node.position({ x: node.x() - box.x, y: node.y() - box.y }); });
            this.layer.add(group); this.tr.nodes([group]); this.selectedNodes = [group]; this.layer.draw(); this.saveState();
        }
    }

    ungroup() {
        if (this.selectedNodes.length === 1 && this.selectedNodes[0] instanceof Konva.Group) {
            const group = this.selectedNodes[0]; const children = group.getChildren().toArray();
            children.forEach(child => { const pos = child.getAbsolutePosition(); child.moveTo(this.layer); child.position(pos); });
            group.destroy(); this.tr.nodes(children); this.selectedNodes = children; this.layer.draw(); this.saveState();
        }
    }

    /**
     * Handles global keyboard shortcuts.
     * @param {KeyboardEvent} e - The keyboard event.
     */
    handleKeyboard(e) {
        // Ignore keyboard events if an input or textarea is focused
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        if (e.ctrlKey || e.metaKey) {
            switch(e.key.toLowerCase()) {
                case 'z': e.preventDefault(); this.undo(); break;
                case 'y': e.preventDefault(); this.redo(); break;
                case 's': e.preventDefault(); this.saveProject(); break;
                case 'g': e.preventDefault(); this.group(); break;
            }
        }
        if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
    }
}
