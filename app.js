// app.js
import { CanvasManager } from './canvasManager.js';

const manager = new CanvasManager('stage-container');

// Toolbar actions
document.getElementById('addText').addEventListener('click', () => manager.addText());

document.getElementById('fileInput').addEventListener('change', (e) => {
  Array.from(e.target.files).forEach(file => manager.addImage(file));
});

document.getElementById('undo').addEventListener('click', () => manager.undo());
document.getElementById('redo').addEventListener('click', () => manager.redo());

document.getElementById('presetGrid').addEventListener('click', () => manager.addGridPreset());
document.getElementById('presetCircles').addEventListener('click', () => manager.addCirclePreset());

document.getElementById('previewBtn').addEventListener('click', () => {
  const previewModal = document.getElementById('previewModal');
  const img = document.getElementById('previewImage');
  img.src = manager.preview();
  previewModal.classList.remove('hidden');
});

document.getElementById('closePreview').addEventListener('click', () => {
  document.getElementById('previewModal').classList.add('hidden');
});

document.getElementById('downloadPNG').addEventListener('click', () => manager.downloadPNG());
document.getElementById('downloadPDF').addEventListener('click', () => manager.downloadPDF());
