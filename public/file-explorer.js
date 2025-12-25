window.FileExplorer = {
    currentPath: '.',
    contextPath: null, 
    
    // --- Initialization & Explorer Window ---
    open() {
        console.log("Opening File Explorer...");
        WindowManager.createWindow('File Explorer', 700, 500, (container) => {
            container.innerHTML = `
                <div class="fe-toolbar" style="padding: 5px; border-bottom: 1px solid #444; display: flex; gap: 5px;">
                    <button onclick="FileExplorer.navigateUp()">⬆ Up</button>
                    <input type="text" id="fe-path" value="${this.currentPath}" style="flex:1; background: #333; color: white; border: 1px solid #555; padding: 2px 5px;" onkeydown="if(event.key === 'Enter') FileExplorer.loadPath(this.value)">
                    <button onclick="FileExplorer.loadPath(document.getElementById('fe-path').value)">Go</button>
                </div>
                <div id="fe-grid" style="display: flex; flex-wrap: wrap; padding: 10px; gap: 10px; overflow-y: auto; height: calc(100% - 40px);" oncontextmenu="FileExplorer.handleContextMenu(event)">
                    Loading...
                </div>
            `;
            this.loadPath(this.currentPath);
        });

        document.addEventListener('click', () => {
            const menu = document.getElementById('context-menu');
            if (menu) menu.style.display = 'none';
        });
    },

    async loadPath(path) {
        try {
            console.log("Loading path:", path);
            const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
            const data = await res.json();
            
            if (data.error) {
                alert('Error: ' + data.error);
                return;
            }

            this.currentPath = data.path;
            const pathInput = document.getElementById('fe-path');
            if(pathInput) pathInput.value = this.currentPath;

            const grid = document.getElementById('fe-grid');
            if (!grid) return; 
            
            grid.innerHTML = '';

            data.files.sort((a, b) => {
                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                return a.isDirectory ? -1 : 1;
            });

            data.files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'fe-item';
                item.title = file.name;
                item.dataset.path = file.path;
                item.style.cssText = 'width: 80px; text-align: center; cursor: pointer; padding: 5px; border-radius: 4px; overflow: hidden;';
                item.innerHTML = `
                    <div style="font-size: 2rem;">${file.isDirectory ? '📁' : '📄'}</div>
                    <div style="font-size: 0.8rem; word-break: break-all; margin-top: 5px; max-height: 3em; overflow: hidden;">${file.name}</div>
                `;
                
                item.onmouseenter = () => item.style.backgroundColor = '#444';
                item.onmouseleave = () => item.style.backgroundColor = 'transparent';

                item.ondblclick = () => {
                    if (file.isDirectory) {
                        this.loadPath(file.path);
                    } else {
                        FileEditor.open(file.path);
                    }
                };
                
                item.oncontextmenu = (e) => {
                    e.stopPropagation();
                    this.showContextMenu(e, file, this.currentPath);
                };

                grid.appendChild(item);
            });

        } catch (e) {
            console.error(e);
            alert('Failed to load files.');
        }
    },

    navigateUp() {
        if (this.currentPath === 'ROOT') return;
        
        const cleanPath = this.currentPath.replace(/[\\/]+$/, '');
        if (/^[a-zA-Z]:$/.test(cleanPath)) {
            this.loadPath('ROOT');
            return;
        }

        const separator = this.currentPath.includes('\\') ? '\\' : '/';
        this.loadPath(this.currentPath + separator + '..');
    },

    // --- Desktop Icons & Drag Logic ---
    
    async loadDesktopIcons() {
        try {
            const res = await fetch(`/api/files?path=${encodeURIComponent('drive_c/Desktop')}`);
            const data = await res.json();
            
            if (data.error) return; 

            const desktopContainer = document.getElementById('desktop-icons');
            desktopContainer.innerHTML = '';

            // Load saved positions
            const savedPositions = JSON.parse(localStorage.getItem('desktop_icons_pos') || '{}');

            // Grid settings
            const startX = 10;
            const startY = 10;
            const gridX = 90; // Icon width + gap
            const gridY = 100; // Icon height + gap
            let currentGridIndex = 0;

            data.files.forEach(file => {
                const icon = document.createElement('div');
                icon.className = 'desktop-icon';
                icon.title = file.name;
                icon.id = `icon-${file.name}`; // simple ID for tracking
                icon.innerHTML = `
                    <div class="desktop-icon-img">${file.isDirectory ? '📁' : '📄'}</div>
                    <div class="desktop-icon-text">${file.name}</div>
                `;

                // Positioning Logic
                let posX, posY;
                if (savedPositions[file.name]) {
                    posX = savedPositions[file.name].x;
                    posY = savedPositions[file.name].y;
                } else {
                    // Auto-arrange in grid (top-down, left-right)
                    // Rows per column (approx screen height / gridY)
                    const rowsPerCol = Math.floor((window.innerHeight - 50) / gridY);
                    const col = Math.floor(currentGridIndex / rowsPerCol);
                    const row = currentGridIndex % rowsPerCol;
                    
                    posX = startX + (col * gridX);
                    posY = startY + (row * gridY);
                    currentGridIndex++;
                }

                icon.style.left = posX + 'px';
                icon.style.top = posY + 'px';

                // Interactions
                icon.ondblclick = () => {
                    if (file.isDirectory) {
                        FileExplorer.open(); 
                        setTimeout(() => FileExplorer.loadPath(file.path), 100);
                    } else {
                        FileEditor.open(file.path);
                    }
                };

                // Add Right Click for Desktop Icons too
                icon.oncontextmenu = (e) => {
                     e.preventDefault();
                     e.stopPropagation();
                     // We pass 'drive_c/Desktop' (or resolved path) as context so refresh works
                     this.showContextMenu(e, file, data.path);
                };
                
                // Dragging
                icon.onmousedown = (e) => this.startIconDrag(e, icon, file.name);

                desktopContainer.appendChild(icon);
            });

        } catch(e) {
            console.error("Failed to load desktop icons", e);
        }
    },

    // Drag State
    isDraggingIcon: false,
    dragIcon: null,
    dragIconName: null,
    dragOffset: { x: 0, y: 0 },

    startIconDrag(e, icon, name) {
        // Only left click
        if (e.button !== 0) return;

        this.isDraggingIcon = true;
        this.dragIcon = icon;
        this.dragIconName = name;
        
        // Calculate offset from icon top-left
        const rect = icon.getBoundingClientRect();
        this.dragOffset.x = e.clientX - rect.left;
        this.dragOffset.y = e.clientY - rect.top;

        icon.classList.add('dragging');

        // Global listeners for smooth drag even if mouse leaves icon
        document.addEventListener('mousemove', this.onIconDrag);
        document.addEventListener('mouseup', this.stopIconDrag);
    },

    onIconDrag: (e) => {
        if (!FileExplorer.isDraggingIcon) return;
        
        const fe = FileExplorer; // Access instance
        const icon = fe.dragIcon;
        
        let newX = e.clientX - fe.dragOffset.x;
        let newY = e.clientY - fe.dragOffset.y;

        // Simple Boundary Check
        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        // Max (approx)
        if (newX > window.innerWidth - 80) newX = window.innerWidth - 80;
        if (newY > window.innerHeight - 80) newY = window.innerHeight - 80;

        icon.style.left = newX + 'px';
        icon.style.top = newY + 'px';
    },

    stopIconDrag: () => {
        const fe = FileExplorer;
        if (!fe.isDraggingIcon) return;

        const icon = fe.dragIcon;
        icon.classList.remove('dragging');

        // Save Position
        const savedPositions = JSON.parse(localStorage.getItem('desktop_icons_pos') || '{}');
        savedPositions[fe.dragIconName] = {
            x: parseInt(icon.style.left),
            y: parseInt(icon.style.top)
        };
        localStorage.setItem('desktop_icons_pos', JSON.stringify(savedPositions));

        // Cleanup
        fe.isDraggingIcon = false;
        fe.dragIcon = null;
        fe.dragIconName = null;
        document.removeEventListener('mousemove', fe.onIconDrag);
        document.removeEventListener('mouseup', fe.stopIconDrag);
    },


    // --- Context Menu Logic ---
    
    handleContextMenu(e) {
        e.preventDefault();
        this.showContextMenu(e, null, this.currentPath);
    },

    handleDesktopContextMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // If we clicked directly on an icon or its children, let the icon handle it
        if (e.target.closest('.desktop-icon')) return; 

        console.log("Desktop Background Right-Clicked");
        this.showContextMenu(e, null, 'drive_c/Desktop'); 
    },

    showContextMenu(e, file, targetPath) {
        e.preventDefault();
        this.contextPath = targetPath;

        const menu = document.getElementById('context-menu');
        menu.style.display = 'flex';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';

        // Boundary check for menu to keep it on screen
        if (e.clientY + 150 > window.innerHeight) {
             menu.style.top = (e.clientY - 150) + 'px';
        }

        if (file) {
            const escapedPath = file.path.replace(/\\/g, '\\\\');
            menu.innerHTML = `
                <div class="context-menu-item" onclick="alert('Properties: ${file.name}')">Properties</div>
                <div class="context-menu-separator"></div>
                <div class="context-menu-item" onclick="FileExplorer.deleteItem('${escapedPath}')">Delete</div>
            `;
        } else {
            menu.innerHTML = `
                <div class="context-menu-item" onclick="FileExplorer.createNewFolder()">New Folder</div>
                <div class="context-menu-item" onclick="FileExplorer.createNewFile()">New Text Document</div>
                <div class="context-menu-separator"></div>
                <div class="context-menu-item" onclick="FileExplorer.loadDesktopIcons(); if(FileExplorer.contextPath !== 'drive_c/Desktop') FileExplorer.loadPath(FileExplorer.contextPath)">Refresh</div>
            `;
        }
    },

    createNewFolder() {
        const name = prompt("Enter folder name:", "New Folder");
        if (!name) return;
        
        let basePath = this.contextPath;
        const separator = (basePath.endsWith('\\') || basePath.endsWith('/')) ? '' : '\\';
        const fullPath = basePath + separator + name;

        fetch('/api/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: fullPath })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                if (this.contextPath !== 'drive_c/Desktop') this.loadPath(this.contextPath);
                this.loadDesktopIcons(); 
            }
            else alert(data.error);
        });
    },

    createNewFile() {
        const name = prompt("Enter file name:", "New Text Document.txt");
        if (!name) return;

        const basePath = this.contextPath;
        const separator = (basePath.endsWith('\\') || basePath.endsWith('/')) ? '' : '\\';
        const fullPath = basePath + separator + name;

        fetch('/api/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: fullPath, content: '' })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                if (this.contextPath !== 'drive_c/Desktop') this.loadPath(this.contextPath);
                this.loadDesktopIcons();
            }
            else alert(data.error);
        });
    },

    deleteItem(path) {
        if (!confirm("Are you sure you want to delete this item?")) return; 
        
        fetch(`/api/file?path=${encodeURIComponent(path)}`, {
            method: 'DELETE'
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                 if (this.contextPath !== 'drive_c/Desktop') this.loadPath(this.contextPath);
                 this.loadDesktopIcons();
            }
            else alert(data.error);
        });
    }
};

window.FileEditor = {
    open(filePath) {
        WindowManager.createWindow(`Editing: ${filePath}`, 800, 600, (container) => {
            container.innerHTML = 'Loading...';
            
            fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    
                    container.innerHTML = `
                        <div style="height: 100%; display: flex; flex-direction: column;">
                            <div style="padding: 5px; background: #333; text-align: right;">
                                <button onclick="FileEditor.save('${filePath.replace(/\\/g, '\\\\')}', this)">💾 Save</button>
                            </div>
                            <div id="editor-container-${Date.now()}" style="flex: 1; overflow: hidden;"></div>
                        </div>
                    `;

                    const editorContainer = container.querySelector('div[id^="editor-container-"]');
                    
                    if (window.monaco) {
                        const editor = monaco.editor.create(editorContainer, {
                            value: data.content,
                            language: this.detectLanguage(filePath),
                            theme: 'vs-dark',
                            automaticLayout: true
                        });
                        
                        container.querySelector('button').editorInstance = editor;
                    } else {
                        editorContainer.innerHTML = `<textarea style="width:100%; height:100%; background: #1e1e1e; color: #ccc; border: none; padding: 10px;">${data.content}</textarea>`;
                        container.querySelector('button').isTextarea = true;
                    }

                })
                .catch(err => {
                    container.innerHTML = `Error: ${err.message}`;
                });
        });
    },

    save(filePath, btn) {
        let content = '';
        if (btn.editorInstance) {
            content = btn.editorInstance.getValue();
        } else if (btn.isTextarea) {
            content = btn.parentNode.nextElementSibling.querySelector('textarea').value;
        }

        fetch('/api/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath, content })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) alert('Saved!');
            else alert('Error: ' + data.error);
        })
        .catch(e => alert('Save failed'));
    },

    detectLanguage(path) {
        if (path.endsWith('.js')) return 'javascript';
        if (path.endsWith('.html')) return 'html';
        if (path.endsWith('.css')) return 'css';
        if (path.endsWith('.json')) return 'json';
        if (path.endsWith('.md')) return 'markdown';
        return 'plaintext';
    }
};

// Initialize Desktop Icons
document.addEventListener('DOMContentLoaded', () => {
    FileExplorer.loadDesktopIcons();
    
    // robust Desktop Context Menu Handler
    const desktop = document.getElementById('desktop');
    if (desktop) {
        desktop.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // STOP Browser Menu
            e.stopPropagation();

            // If we clicked strictly on an icon (or its text/img), ignore here
            // because the icon's own listener (added in loadDesktopIcons) will handle it.
            // However, since we are at the #desktop level, bubbling might have brought it here.
            // If the target is an icon, we let the specific icon handler do the work if we haven't stopped propagation there.
            
            // Check if we clicked an icon
            if (e.target.closest('.desktop-icon')) {
                // The icon's own event handler (defined in loadDesktopIcons) should have fired.
                // If it didn't (due to some reason), we could handle it here, but usually it works.
                return;
            }

            // Otherwise, it's the background
            console.log("Right Click on Desktop Background Detected");
            FileExplorer.showContextMenu(e, null, 'drive_c/Desktop');
        });
    }
});