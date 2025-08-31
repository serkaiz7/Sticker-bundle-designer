// app.js
const manager = new CanvasManager("container");

// Upload images
document.getElementById("uploadImages").addEventListener("change", e => {
  Array.from(e.target.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => manager.addImage(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
});

// Add text
document.getElementById("addTextBtn").addEventListener("click", () => {
  manager.addText();
});

// Toggle grid
document.getElementById("toggleGridBtn").addEventListener("click", () => {
  manager.toggleGrid();
});

// Undo/Redo
document.getElementById("undoBtn").addEventListener("click", () => manager.undo());
document.getElementById("redoBtn").addEventListener("click", () => manager.redo());

// Preview modal
const modal = document.getElementById("previewModal");
document.getElementById("previewBtn").addEventListener("click", () => {
  modal.classList.remove("hidden");
  const previewCanvas = document.getElementById("previewCanvas");
  const dataURL = manager.stage.toDataURL({ pixelRatio: 2 });
  const ctx = previewCanvas.getContext("2d");
  const img = new Image();
  img.onload = () => {
    previewCanvas.width = img.width;
    previewCanvas.height = img.height;
    ctx.drawImage(img, 0, 0);
  };
  img.src = dataURL;
});
document.getElementById("closePreview").addEventListener("click", () => modal.classList.add("hidden"));

// Download PNG
document.getElementById("downloadPNG").addEventListener("click", () => {
  const dataURL = manager.stage.toDataURL({ pixelRatio: 2 });
  fetch(dataURL)
    .then(res => res.blob())
    .then(blob => saveAs(blob, "stickers.png"));
});

// Download PDF
document.getElementById("downloadPDF").addEventListener("click", () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("l", "pt", "a4");
  const dataURL = manager.stage.toDataURL({ pixelRatio: 2 });
  pdf.addImage(dataURL, "PNG", 0, 0, 842, 595);
  pdf.save("stickers.pdf");
});

// Direct Print
document.getElementById("printBtn").addEventListener("click", () => {
  const dataURL = manager.stage.toDataURL({ pixelRatio: 2 });
  const win = window.open("");
  win.document.write(`<img src="${dataURL}" onload="window.print();window.close()" />`);
});
