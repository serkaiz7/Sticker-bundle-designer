import { CanvasManager } from './canvasManager.js';

document.addEventListener('DOMContentLoaded', () => {
    const cm = new CanvasManager('container');

    /**
     * Shows a toast notification at the bottom of the screen.
     * @param {string} message - The message to display.
     */
    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => { toast.classList.remove('show'); }, 3000);
    }

    /**
     * A fetch wrapper with exponential backoff for retrying failed requests.
     * @param {string} url - The API endpoint URL.
     * @param {object} options - The options for the fetch request.
     * @param {number} [maxRetries=5] - The maximum number of retries.
     * @returns {Promise<object>} The JSON response from the API.
     */
    async function fetchWithBackoff(url, options, maxRetries = 5) {
        let delay = 1000;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.ok) return await response.json();
                // Handle rate limiting specifically
                if (response.status === 429) { 
                    await new Promise(res => setTimeout(res, delay)); 
                    delay *= 2; 
                } else { 
                    // Handle other errors
                    const error = await response.text(); 
                    throw new Error(`API Error: ${response.status} ${error}`); 
                }
            } catch (error) { 
                if (i === maxRetries - 1) throw error; 
                await new Promise(res => setTimeout(res, delay)); 
                delay *= 2; 
            }
        }
    }

    // -- Toolbar Event Listeners --
    document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            Array.from(e.target.files).forEach((file, index) => {
                const reader = new FileReader();
                reader.onload = (event) => cm.addImage(event.target.result, index);
                reader.readAsDataURL(file);
            });
            e.target.value = ''; // Reset input
        }
    });

    document.getElementById('addTextBtn').addEventListener('click', () => cm.addText());
    document.getElementById('presetSelect').addEventListener('change', (e) => { cm.addPreset(e.target.value); e.target.value = ''; });
    document.getElementById('undoBtn').addEventListener('click', () => cm.undo());
    document.getElementById('redoBtn').addEventListener('click', () => cm.redo());
    document.getElementById('saveBtn').addEventListener('click', () => cm.saveProject());
    document.getElementById('loadBtn').addEventListener('click', () => document.getElementById('loadInput').click());
    document.getElementById('loadInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) { const reader = new FileReader(); reader.onload = (event) => cm.loadProject(event.target.result); reader.readAsText(file); }
    });
    document.getElementById('canvasSizeSelect').addEventListener('change', (e) => cm.setCanvasSize(e.target.value));
    document.getElementById('exportPngBtn').addEventListener('click', () => cm.exportToPNG());
    document.getElementById('exportPdfBtn').addEventListener('click', () => cm.exportToPDF());

    // -- Preview Modal --
    const previewModal = document.getElementById('previewModal');
    document.getElementById('previewBtn').addEventListener('click', () => { 
        previewModal.style.display = 'flex'; 
        document.getElementById('previewImage').src = cm.getPreviewDataURL(); 
    });
    document.getElementById('closePreview').addEventListener('click', () => { 
        previewModal.style.display = 'none'; 
        document.getElementById('previewImage').src = ''; 
    });

    // -- Theme Toggle --
    document.getElementById('themeToggle').addEventListener('click', () => {
        document.body.classList.toggle('dark');
        localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
        cm.stage.container().style.backgroundColor = document.body.classList.contains('dark') ? '#3a3f44' : 'white';
        cm.drawGrid();
    });
    if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');

    // -- Sidebar Tools and Properties --
    document.getElementById('deleteBtn').addEventListener('click', () => cm.deleteSelected());
    document.getElementById('groupBtn').addEventListener('click', () => cm.group());
    document.getElementById('ungroupBtn').addEventListener('click', () => cm.ungroup());

    document.getElementById('fontFamily').addEventListener('change', (e) => cm.updateTextProperty('fontFamily', e.target.value));
    document.getElementById('fontSize').addEventListener('input', (e) => cm.updateTextProperty('fontSize', e.target.value));
    document.getElementById('fillColor').addEventListener('input', (e) => cm.updateTextProperty('fill', e.target.value));
    document.getElementById('boldBtn').addEventListener('click', () => cm.updateTextProperty('bold'));
    document.getElementById('italicBtn').addEventListener('click', () => cm.updateTextProperty('italic'));
    document.getElementById('underlineBtn').addEventListener('click', () => cm.updateTextProperty('underline'));

    // -- Global Keyboard Listener --
    document.addEventListener('keydown', (e) => cm.handleKeyboard(e));

    // --- AI FEATURES ---
    const aiImageModal = document.getElementById('aiImageModal');
    const generateImageBtn = document.getElementById('generateImageBtn');

    document.getElementById('openAiImageModalBtn').addEventListener('click', () => { aiImageModal.style.display = 'flex'; });
    document.getElementById('closeAiImageModal').addEventListener('click', () => { aiImageModal.style.display = 'none'; });

    // AI Image Generation
    generateImageBtn.addEventListener('click', async () => {
        const prompt = document.getElementById('aiImagePrompt').value;
        if (!prompt) { showToast("Please enter a prompt."); return; }
        
        const loader = document.getElementById('aiImageLoader');
        const imageEl = document.getElementById('aiGeneratedImage');
        const addBtn = document.getElementById('addAiImageToCanvasBtn');
        
        loader.style.display = 'block'; imageEl.style.display = 'none'; addBtn.style.display = 'none';
        generateImageBtn.disabled = true; generateImageBtn.textContent = "Generating...";

        const apiKey = ""; // API key is handled by the environment
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
        const payload = { instances: [{ prompt: prompt }], parameters: { "sampleCount": 1 } };

        try {
            const result = await fetchWithBackoff(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (result.predictions && result.predictions[0]?.bytesBase64Encoded) {
                const imageUrl = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
                imageEl.src = imageUrl; imageEl.style.display = 'block'; addBtn.style.display = 'block';
            } else { throw new Error("No image data in API response."); }
        } catch (error) { 
            console.error('Image generation failed:', error); 
            showToast('Image generation failed. Please try again.'); 
        } finally { 
            loader.style.display = 'none'; 
            generateImageBtn.disabled = false; 
            generateImageBtn.textContent = "Generate"; 
        }
    });

    document.getElementById('addAiImageToCanvasBtn').addEventListener('click', () => {
        const imageUrl = document.getElementById('aiGeneratedImage').src;
        if(imageUrl) cm.addImage(imageUrl);
        aiImageModal.style.display = 'none';
    });

    // AI Text Suggestions
    document.getElementById('generateTextBtn').addEventListener('click', async () => {
        const prompt = document.getElementById('aiTextPrompt').value;
        if (!prompt) { showToast("Please enter a topic for text ideas."); return; }
        
        const suggestionsContainer = document.getElementById('aiTextSuggestions');
        suggestionsContainer.innerHTML = '<li>Loading...</li>';

        const apiKey = ""; // API key is handled by the environment
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        const userQuery = `Generate 5 short, catchy phrases for a sticker related to "${prompt}". Each phrase should be less than 8 words. Return them as a numbered list.`;
        const payload = { contents: [{ parts: [{ text: userQuery }] }] };

        try {
            const result = await fetchWithBackoff(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                const suggestions = text.split('\n').map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(s => s);
                suggestionsContainer.innerHTML = '';
                suggestions.forEach(suggestion => {
                    const li = document.createElement('li');
                    li.textContent = suggestion;
                    li.classList.add('ai-suggestion-item');
                    suggestionsContainer.appendChild(li);
                });
            } else { throw new Error("No text content in API response."); }
        } catch (error) { 
            console.error('Text generation failed:', error); 
            showToast('Text generation failed.'); 
            suggestionsContainer.innerHTML = '<li>Failed to load.</li>'; 
        }
    });

    document.getElementById('aiTextSuggestions').addEventListener('click', (e) => {
        if (e.target?.matches('li.ai-suggestion-item')) {
            cm.updateTextContent(e.target.textContent);
        }
    });
});

