// === app.js ===
// Connects UI to CanvasManager

const {
  initStage,
  addImage,
  addText,
  addPreset,
  undo,
  redo,
  snapImageToPreset
} = window.CanvasManager;

document.addEventListener("DOMContentLoaded", () => {
  // Initialize stage
  initStage("stage-container");

  // === Toolbar Actions ===
  document.getElementById("addText").addEventListener("click", () => addText());
  document.getElementById("undo").addEventListener("click", () => undo());
  document.getElementById("redo").addEventListener("click", () => redo());

  // Upload Images
  document.getElementById("fileInput").addEventListener("change", (e) => {
    [...e.target.files].forEach(file => addImage(file));
  });

  // Presets
  document.querySelectorAll(".preset").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.preset;
      addPreset(type);
    });
  });

  // === Preview Modal ===
  const previewBtn = document.getElementById("previewBtn");
  const previewModal = document.getElementById("previewModal");
  const closePreview = document.getElementById("closePreview");
  const previewImage = document.getElementById("previewImage");

  previewBtn.addEventListener("click", () => {
    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    previewImage.src = dataURL;
    previewModal.classList.remove("hidden");
  });

  closePreview.addEventListener("click", () => {
    previewModal.classList.add("hidden");
  });

  // Download PNG
  document.getElementById("downloadPNG").addEventListener("click", () => {
    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    const link = document.createElement("a");
    link.download = "sticker.png";
    link.href = dataURL;
    link.click();
  });

  // Download PDF
  document.getElementById("downloadPDF").addEventListener("click", () => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("l", "px", [stage.width(), stage.height()]);
    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    pdf.addImage(dataURL, "PNG", 0, 0, stage.width(), stage.height());
    pdf.save("sticker.pdf");
  });

  // Print
  document.getElementById("printBtn").addEventListener("click", () => {
    const dataURL = stage.toDataURL({ pixelRatio: 2 });
    const w = window.open();
    w.document.write(`<img src="${dataURL}" style="width:100%">`);
    w.print();
  });

  // === Save / Load Projects (LocalStorage) ===
  const saveBtn = document.getElementById("saveProject");
  const projectList = document.getElementById("projectList");

  saveBtn.addEventListener("click", () => {
    const name = prompt("Project name:");
    if (name) {
      localStorage.setItem(`project-${name}`, stage.toJSON());
      refreshProjects();
    }
  });

  document.getElementById("newProject").addEventListener("click", () => {
    if (confirm("Clear stage and start new project?")) {
      stage.destroyChildren();
      initStage("stage-container");
    }
  });

  document.getElementById("clearAll").addEventListener("click", () => {
    if (confirm("Clear all projects?")) {
      Object.keys(localStorage)
        .filter(k => k.startsWith("project-"))
        .forEach(k => localStorage.removeItem(k));
      refreshProjects();
    }
  });

  function refreshProjects() {
    projectList.innerHTML = "";
    Object.keys(localStorage)
      .filter(k => k.startsWith("project-"))
      .forEach(k => {
        const name = k.replace("project-", "");
        const btn = document.createElement("button");
        btn.textContent = name;
        btn.addEventListener("click", () => {
          const data = localStorage.getItem(`project-${name}`);
          stage.destroyChildren();
          Konva.Node.create(data, stage);
          stage.draw();
        });
        projectList.appendChild(btn);
      });
  }

  refreshProjects();

  // === Dark Mode Toggle ===
  const darkToggle = document.getElementById("darkToggle");
  darkToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
  });
});
