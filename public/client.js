const socket = io();
const statusDiv = document.getElementById('status'); 

// --- Session Persistence ---
const getSessionId = () => {
    let id = localStorage.getItem('fakeos_session_id');
    if (!id) {
        id = 'sess-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('fakeos_session_id', id);
    }
    return id;
};

// Global list of active terminals
const activeTerminals = [];

socket.on('connect', () => {
    console.log('Connected to server');
    // Join Persistent Session
    const sessionId = getSessionId();
    socket.emit('join-session', sessionId);
});

socket.on('server-message', (msg) => {
    console.log(`Server says: ${msg}`);
});

socket.on('term-output', (data) => {
    activeTerminals.forEach(t => t.write(data));
});

socket.on('disconnect', () => {
    console.log('Disconnected');
    activeTerminals.forEach(t => t.write('\r\n\x1b[31mDisconnected from server\x1b[0m\r\n'));
});

// Function to spawn a new Terminal Window
window.spawnTerminal = function() {
    WindowManager.createWindow('Terminal', 800, 450, (container) => {
        // Initialize xterm.js
        const term = new Terminal({
            cursorBlink: true,
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 14,
            theme: {
                background: getComputedStyle(document.documentElement).getPropertyValue('--window-bg').trim() || '#1e1e1e',
                foreground: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#f0f0f0',
            }
        });
        
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(container);
        
        // Fit immediately and on resize
        setTimeout(() => fitAddon.fit(), 0);
        
        // Handle Input
        term.onData(data => {
            socket.emit('term-input', data);
        });

        // Add to active list
        activeTerminals.push(term);
        
        // Handle Resize (Window resize or maximizing)
        const resizeObserver = new ResizeObserver(() => {
            try {
                fitAddon.fit();
                socket.emit('term-resize', { cols: term.cols, rows: term.rows });
            } catch (e) {
                // Ignore errors
            }
        });
        resizeObserver.observe(container);

        // Cleanup
        term.element.addEventListener('DOMNodeRemovedFromDocument', () => {
             const index = activeTerminals.indexOf(term);
             if (index > -1) activeTerminals.splice(index, 1);
        });
    });
};

// --- Theme Management ---
window.loadTheme = function() {
    const theme = JSON.parse(localStorage.getItem('fakeos_theme') || '{}');
    const root = document.documentElement;
    Object.keys(theme).forEach(key => {
        root.style.setProperty(key, theme[key]);
    });
}

window.saveTheme = function(key, value) {
    const root = document.documentElement;
    root.style.setProperty(key, value);
    
    const theme = JSON.parse(localStorage.getItem('fakeos_theme') || '{}');
    theme[key] = value;
    localStorage.setItem('fakeos_theme', JSON.stringify(theme));
}

window.openSettings = function() {
    WindowManager.createWindow('Settings', 400, 350, (container) => {
        container.innerHTML = `
            <div style="padding: 20px; color: var(--text-color);">
                <h3>Theme Settings</h3>
                <div style="margin-bottom: 10px;">
                    <label>Accent Color:</label>
                    <input type="color" id="set-accent" value="${getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim()}">
                </div>
                <div style="margin-bottom: 10px;">
                    <label>Background Color:</label>
                    <input type="color" id="set-bg" value="${getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim()}">
                </div>
                <div style="margin-bottom: 10px;">
                    <label>Wallpaper URL:</label>
                    <input type="text" id="set-wallpaper" style="width: 100%; margin-top: 5px; background: #333; color: white; border: 1px solid #555;" value="">
                    <small>Enter URL and press Apply</small>
                </div>
                <button onclick="applyWallpaper()">Apply Wallpaper</button>
                <button onclick="resetTheme()">Reset Default</button>
            </div>
        `;
        
        // Handlers
        container.querySelector('#set-accent').addEventListener('input', (e) => {
            saveTheme('--accent-color', e.target.value);
            saveTheme('--accent-hover', e.target.value); 
        });

        container.querySelector('#set-bg').addEventListener('input', (e) => {
            saveTheme('--bg-color', e.target.value);
            saveTheme('--window-bg', e.target.value); // Sync window bg too? maybe
        });

        window.applyWallpaper = () => {
            const url = container.querySelector('#set-wallpaper').value;
            if (url) {
                saveTheme('--wallpaper', `url('${url}')`);
            }
        };

        window.resetTheme = () => {
            localStorage.removeItem('fakeos_theme');
            location.reload();
        };
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
});

// Global UI Handlers
document.addEventListener('click', (e) => {
    const menu = document.getElementById('context-menu');
    if (menu && menu.style.display !== 'none') {
        menu.style.display = 'none';
    }
});
