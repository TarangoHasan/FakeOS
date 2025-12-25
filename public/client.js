const socket = io();
const statusDiv = document.getElementById('status'); // Might be missing in new HTML, check existence

// Global list of active terminals to handle resizing/data broadcasting
const activeTerminals = [];

socket.on('connect', () => {
    console.log('Connected to server');
    // Open initial terminal - DISABLED per user request
    // spawnTerminal();
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
                background: '#1e1e1e',
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
        // We use a ResizeObserver on the container to trigger fit
        const resizeObserver = new ResizeObserver(() => {
            try {
                fitAddon.fit();
                // Send new size to server (using the last resized terminal as authority is imperfect but works for now)
                socket.emit('term-resize', { cols: term.cols, rows: term.rows });
            } catch (e) {
                // Ignore errors if terminal is disposed
            }
        });
        resizeObserver.observe(container);

        // Cleanup when window is closed (We need a way to detect this, 
        // effectively we'd need to hook into the close button or check existence)
        // For now, simpler:
        term.element.addEventListener('DOMNodeRemovedFromDocument', () => {
             const index = activeTerminals.indexOf(term);
             if (index > -1) activeTerminals.splice(index, 1);
        });
    });
};