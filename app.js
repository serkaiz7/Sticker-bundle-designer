// app.js
import { CanvasManager } from './canvasManager.js';

const cm = new CanvasManager('container');

// Upload images
document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
        Array.from(files).forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                cm.addImage(event.target.result, () => {
                    if (index === files.length - 1) {
                        e.target.value = ''; // Reset input
                    }
                });
            };
            reader.readAsDataURL(file);
        });
    }
});

// Add text
document.getElementById('addTextBtn').addEventListener('click', () => cm.addText());

// Presets
document.getElementById('presetSelect').addEventListener('change', (e) => {
    cm.addPreset(e.target.value);
    e.target.value = '';
});

// Undo/Redo
document.getElementById('undoBtn').addEventListener('click', () => cm.undo());
document.getElementById('redoBtn').addEventListener('click', () => cm.redo());

// Save/Load
document.getElementById('saveBtn').addEventListener('click', () => cm.saveProject());
document.getElementById('loadBtn').addEventListener('click', () => document.getElementById('loadInput').click());
document.getElementById('loadInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => cm.loadProject(event.target.result);
        reader.readAsText(file);
    }
});

// Preview
const modal = document.getElementById('previewModal');
document.getElementById('previewBtn').addEventListener('click', () => {
    modal.style.display = 'flex';
    cm.getPreviewStage();
});
document.getElementById('closePreview').addEventListener('click', () => {
    modal.style.display = 'none';
    document.getElementById('previewContainer').innerHTML = '';
});

// Export
document.getElementById('exportPngBtn').addEventListener('click', () => cm.exportToPNG());
document.getElementById('exportPdfBtn').addEventListener('click', () => cm.exportToPDF());
document.getElementById('printBtn').addEventListener('click', () => cm.print());

// Theme toggle
document.getElementById('themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});
if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');

// Properties
document.getElementById('fontFamily').addEventListener('change', (e) => cm.updateTextProperty('fontFamily', e.target.value));
document.getElementById('fontSize').addEventListener('input', (e) => cm.updateTextProperty('fontSize', e.target.value));
document.getElementById('fillColor').addEventListener('input', (e) => cm.updateTextProperty('fill', e.target.value));
document.getElementById('boldBtn').addEventListener('click', () => cm.updateTextProperty('bold'));
document.getElementById('italicBtn').addEventListener('click', () => cm.updateTextProperty('italic'));
document.getElementById('underlineBtn').addEventListener('click', () => cm.updateTextProperty('underline'));

// Keyboard
document.addEventListener('keydown', (e) => cm.handleKeyboard(e));
