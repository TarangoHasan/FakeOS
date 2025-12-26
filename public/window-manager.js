const WindowManager = {
    windows: [],
    zIndex: 100,
    desktop: null,
    taskbarApps: null,

    init() {
        this.desktop = document.getElementById('desktop');
        this.taskbarApps = document.getElementById('taskbar-apps');
    },

    createWindow(title, width = 600, height = 400, contentCallback) {
        const id = 'win-' + Date.now();
        this.zIndex++;

        // DOM Structure
        const win = document.createElement('div');
        win.className = 'window';
        win.id = id;
        win.style.width = width + 'px';
        win.style.height = height + 'px';
        win.style.top = '50px';
        win.style.left = '50px';
        win.style.zIndex = this.zIndex;

        win.innerHTML = `
            <div class="window-header active" onmousedown="WindowManager.startDrag(event, '${id}')">
                <span class="window-title">${title}</span>
                <div class="window-controls">
                    <button class="window-button minimize" onclick="WindowManager.minimizeWindow('${id}')">_</button>
                    <button class="window-button maximize" onclick="WindowManager.maximizeWindow('${id}')">□</button>
                    <button class="window-button close" onclick="WindowManager.closeWindow('${id}')">×</button>
                </div>
            </div>
            <div class="window-content" id="${id}-content"></div>
            <div class="resizer resizer-r"></div>
            <div class="resizer resizer-b"></div>
            <div class="resizer resizer-br"></div>
        `;

        // Prevent Desktop Context Menu from triggering inside windows
        win.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
        });

        this.desktop.appendChild(win);
        
        // Add to tracking
        const windowObj = { id, element: win, minimized: false, maximized: false };
        this.windows.push(windowObj);

        // Add Taskbar Item
        this.addTaskbarItem(id, title);

        // Activate logic
        win.addEventListener('mousedown', () => this.bringToFront(id));
        
        // Execute callback to render content (e.g., Terminal)
        if (contentCallback) {
            contentCallback(document.getElementById(`${id}-content`));
        }

        // Setup Resizers
        this.setupResizers(win);

        return id;
    },

    createTerminal() {
        // This function will be overridden or used by client.js
        // We'll dispatch a custom event or call a global function if needed.
        // For now, let's assume client.js will hook into this.
        if (window.spawnTerminal) {
            window.spawnTerminal();
        } else {
            console.error("Terminal spawner not ready");
        }
    },

    closeWindow(id) {
        const win = document.getElementById(id);
        if (win) {
            win.remove();
            this.windows = this.windows.filter(w => w.id !== id);
            
            // Remove Taskbar Item
            const tbItem = document.getElementById(`tb-${id}`);
            if (tbItem) tbItem.remove();
        }
    },

    minimizeWindow(id) {
        const win = document.getElementById(id);
        win.style.display = 'none';
        const wObj = this.windows.find(w => w.id === id);
        if (wObj) wObj.minimized = true;
        
        this.updateTaskbarState(id);
    },

    restoreWindow(id) {
        const win = document.getElementById(id);
        win.style.display = 'flex';
        this.bringToFront(id);
        const wObj = this.windows.find(w => w.id === id);
        if (wObj) wObj.minimized = false;

        this.updateTaskbarState(id);
    },

    toggleWindow(id) {
        const wObj = this.windows.find(w => w.id === id);
        if (wObj.minimized) {
            this.restoreWindow(id);
        } else {
            // If active and on top, minimize. If not on top, bring to front.
            if (document.getElementById(id).style.zIndex == this.zIndex) {
                this.minimizeWindow(id);
            } else {
                this.bringToFront(id);
            }
        }
    },

    maximizeWindow(id) {
        const win = document.getElementById(id);
        const wObj = this.windows.find(w => w.id === id);

        if (!wObj.maximized) {
            wObj.prevStyle = {
                top: win.style.top,
                left: win.style.left,
                width: win.style.width,
                height: win.style.height
            };
            win.style.top = '0';
            win.style.left = '0';
            win.style.width = '100%';
            win.style.height = '100%';
            wObj.maximized = true;
        } else {
            win.style.top = wObj.prevStyle.top;
            win.style.left = wObj.prevStyle.left;
            win.style.width = wObj.prevStyle.width;
            win.style.height = wObj.prevStyle.height;
            wObj.maximized = false;
        }
        
        // Trigger resize event for terminal
        window.dispatchEvent(new Event('resize'));
    },

    bringToFront(id) {
        this.zIndex++;
        const win = document.getElementById(id);
        win.style.zIndex = this.zIndex;
        
        // Update styling active state
        document.querySelectorAll('.window-header').forEach(h => h.classList.remove('active'));
        win.querySelector('.window-header').classList.add('active');

        this.updateTaskbarState(id);
    },

    addTaskbarItem(id, title) {
        const item = document.createElement('div');
        item.className = 'taskbar-item active';
        item.id = `tb-${id}`;
        item.innerText = title;
        item.onclick = () => this.toggleWindow(id);
        this.taskbarApps.appendChild(item);
    },

    updateTaskbarState(activeId) {
        document.querySelectorAll('.taskbar-item').forEach(item => item.classList.remove('active'));
        const activeItem = document.getElementById(`tb-${activeId}`);
        const wObj = this.windows.find(w => w.id === activeId);
        
        if (activeItem && !wObj.minimized) {
            activeItem.classList.add('active');
        }
    },

    // --- Dragging Logic ---
    isDragging: false,
    dragOffset: { x: 0, y: 0 },
    dragTarget: null,

    startDrag(e, id) {
        if (e.target.classList.contains('window-button')) return; // Don't drag if clicking controls
        
        const win = document.getElementById(id);
        this.isDragging = true;
        this.dragTarget = win;
        this.dragOffset.x = e.clientX - win.offsetLeft;
        this.dragOffset.y = e.clientY - win.offsetTop;
        
        this.bringToFront(id);
        
        document.addEventListener('mousemove', this.onDrag);
        document.addEventListener('mouseup', this.stopDrag);
    },

    onDrag: (e) => {
        if (!WindowManager.isDragging) return;
        WindowManager.dragTarget.style.left = (e.clientX - WindowManager.dragOffset.x) + 'px';
        WindowManager.dragTarget.style.top = (e.clientY - WindowManager.dragOffset.y) + 'px';
    },

    stopDrag: () => {
        WindowManager.isDragging = false;
        WindowManager.dragTarget = null;
        document.removeEventListener('mousemove', WindowManager.onDrag);
        document.removeEventListener('mouseup', WindowManager.stopDrag);
    },

    // --- Resizing Logic ---
    setupResizers(win) {
        const resizers = win.querySelectorAll('.resizer');
        let isResizing = false;
        let currentResizer = null;
        
        resizers.forEach(resizer => {
            resizer.addEventListener('mousedown', (e) => {
                isResizing = true;
                currentResizer = resizer;
                e.preventDefault();
                
                document.addEventListener('mousemove', onResize);
                document.addEventListener('mouseup', stopResize);
            });
        });

        const onResize = (e) => {
            if (!isResizing) return;
            const rect = win.getBoundingClientRect();
            
            if (currentResizer.classList.contains('resizer-r') || currentResizer.classList.contains('resizer-br')) {
                win.style.width = (e.clientX - rect.left) + 'px';
            }
            if (currentResizer.classList.contains('resizer-b') || currentResizer.classList.contains('resizer-br')) {
                win.style.height = (e.clientY - rect.top) + 'px';
            }
            
            // Dispatch resize event for terminal to fit
            window.dispatchEvent(new Event('resize'));
        };

        const stopResize = () => {
            isResizing = false;
            document.removeEventListener('mousemove', onResize);
            document.removeEventListener('mouseup', stopResize);
        };
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    WindowManager.init();
});
