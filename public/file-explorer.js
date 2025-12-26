window.FileExplorer = {
    currentPath: '.',
    contextPath: null, 
    clipboard: null, // { path: string, type: 'copy'|'cut' }
    watcherSetup: false,

    // --- Initialization & Explorer Window ---
    open() {
        console.log("Opening File Explorer...");
        // Setup Watcher Listener if not already
        if (!this.watcherSetup) {
            if (window.socket) {
                socket.on('file-change', (data) => {
                    // If the changed path is what we are looking at (or desktop)
                    if (data.path === this.currentPath || data.path === 'drive_c/Desktop' || (data.path.includes('Desktop') && this.currentPath === 'drive_c/Desktop')) {
                        this.refreshCurrentView();
                    }
                });
            }
            this.watcherSetup = true;
        }

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
            
            // Tell server to watch this path
            if (window.socket) socket.emit('watch-path', path);

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
                item.dataset.isDirectory = file.isDirectory; // Add for Drag & Drop
                item.style.cssText = 'width: 80px; text-align: center; cursor: pointer; padding: 5px; border-radius: 4px; overflow: hidden;';
                item.innerHTML = `
                    <div style="font-size: 2rem; pointer-events: none;">${this.getFileIcon(file)}</div>
                    <div style="font-size: 0.8rem; word-break: break-all; margin-top: 5px; max-height: 3em; overflow: hidden; pointer-events: none;">${file.name}</div>
                `;
                
                item.onmouseenter = () => item.style.backgroundColor = '#444';
                item.onmouseleave = () => item.style.backgroundColor = 'transparent';

                item.ondblclick = () => {
                    if (file.isDirectory) {
                        this.loadPath(file.path);
                    } else {
                        this.openFile(file);
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
                icon.dataset.path = file.path; // Store path
                icon.dataset.isDirectory = file.isDirectory; // Store type
                icon.innerHTML = `
                    <div class="desktop-icon-img">${this.getFileIcon(file)}</div>
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
                        this.openFile(file);
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

    stopIconDrag: (e) => {
        const fe = FileExplorer;
        if (!fe.isDraggingIcon) return;

        const icon = fe.dragIcon;
        icon.classList.remove('dragging');
        
        // Check for Drop Target (Folder) 
        // We use clientX/Y from the event if available, otherwise we might need to track it
        const x = e.clientX || (parseInt(icon.style.left) + fe.dragOffset.x);
        const y = e.clientY || (parseInt(icon.style.top) + fe.dragOffset.y);

        const dropTargets = document.elementsFromPoint(x, y);
        let targetFolder = null;

        for (let el of dropTargets) {
            // Check Desktop Icons
            if (el.classList.contains('desktop-icon') && el !== icon && el.dataset.isDirectory === 'true') {
                targetFolder = el.dataset.path;
                break;
            }
            // Check File Explorer Items
            if (el.classList.contains('fe-item') && el.dataset.isDirectory === 'true') {
                targetFolder = el.dataset.path;
                break;
            }
        }

        if (targetFolder) {
            const sourcePath = icon.dataset.path;
            const fileName = fe.dragIconName;
            const separator = (targetFolder.endsWith('\\') || targetFolder.endsWith('/')) ? '' : '\\';
            const destPath = targetFolder + separator + fileName;

            if (confirm(`Move '${fileName}' to folder?`)) {
                fetch('/api/move', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sourcePath, destPath })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        fe.refreshCurrentView();
                    } else {
                        alert('Move failed: ' + data.error);
                        // Revert position visually if failed
                        fe.loadDesktopIcons();
                    }
                });
                
                // Reset Drag State and Return (Don't save new position)
                fe.isDraggingIcon = false;
                fe.dragIcon = null;
                fe.dragIconName = null;
                document.removeEventListener('mousemove', fe.onIconDrag);
                document.removeEventListener('mouseup', fe.stopIconDrag);
                return;
            }
        }

        // Save Position (Only if not moved)
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
        if (e.clientY + 200 > window.innerHeight) {
             menu.style.top = (e.clientY - 200) + 'px';
        }

        let menuHtml = '';

        if (file) {
            const escapedPath = file.path.replace(/\\/g, '\\\\');
            menuHtml += `
                <div class="context-menu-item" onclick="alert('Properties: ${file.name}')">Properties</div>
                <div class="context-menu-separator"></div>
            `;
            
            const ext = file.name.split('.').pop().toLowerCase();

            // HTML files: Open with Editor
            if (ext === 'html' || ext === 'htm') {
                menuHtml += `<div class="context-menu-item" onclick="FileEditor.open('${escapedPath}')">Open with Editor</div>`;
            }
            
            // Archives: Extract Here
            if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) {
                 menuHtml += `<div class="context-menu-item" onclick="FileExplorer.extractItem('${escapedPath}')">Extract Here</div>`;
            }

            // Any file/folder: Compress to .zip
            menuHtml += `<div class="context-menu-item" onclick="FileExplorer.compressItem('${escapedPath}')">Compress to .zip</div>`;

            menuHtml += `
                <div class="context-menu-item" onclick="FileExplorer.renameItem('${escapedPath}', '${file.name}')">Rename</div>
                <div class="context-menu-item" onclick="FileExplorer.copyItem('${escapedPath}', 'copy')">Copy</div>
                <div class="context-menu-item" onclick="FileExplorer.copyItem('${escapedPath}', 'cut')">Cut</div>
                <div class="context-menu-separator"></div>
                <div class="context-menu-item" onclick="FileExplorer.deleteItem('${escapedPath}')">Delete</div>
            `;
        } else {
            menuHtml += `
                <div class="context-menu-item" onclick="FileExplorer.createNewFolder()">New Folder</div>
                <div class="context-menu-item" onclick="FileExplorer.createNewFile()">New Text Document</div>
                <div class="context-menu-separator"></div>
                <div class="context-menu-item" onclick="FileExplorer.loadDesktopIcons(); if(FileExplorer.contextPath !== 'drive_c/Desktop') FileExplorer.loadPath(FileExplorer.contextPath)">Refresh</div>
            `;
            
            if (this.clipboard) {
                menuHtml += `
                    <div class="context-menu-separator"></div>
                    <div class="context-menu-item" onclick="FileExplorer.pasteItem()">Paste</div>
                `;
            }
        }
        
        menu.innerHTML = menuHtml;
    },

    renameItem(path, currentName) {
        const newName = prompt("Enter new name:", currentName);
        if (!newName || newName === currentName) return;

        // Construct new path
        // We need to find the parent dir of 'path'
        const separator = path.includes('\\') ? '\\' : '/';
        const parentDir = path.substring(0, path.lastIndexOf(separator));
        const newPath = parentDir + separator + newName;

        fetch('/api/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath: path, newPath: newPath })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                this.refreshCurrentView();
            } else {
                alert('Rename failed: ' + data.error);
            }
        });
    },

    copyItem(path, type) {
        this.clipboard = { path, type };
        // alert((type === 'cut' ? 'Cut' : 'Copied') + ' to clipboard');
    },

    pasteItem() {
        if (!this.clipboard) return; 
        
        const destDir = this.contextPath;
        // Determine destination path (keep original name)
        const separator = this.clipboard.path.includes('\\') ? '\\' : '/';
        const fileName = this.clipboard.path.substring(this.clipboard.path.lastIndexOf(separator) + 1);
        
        // Fix for destination path separator
        const destSeparator = (destDir.endsWith('\\') || destDir.endsWith('/')) ? '' : '\\';
        const destPath = destDir + destSeparator + fileName;

        const endpoint = this.clipboard.type === 'cut' ? '/api/move' : '/api/copy';

        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath: this.clipboard.path, destPath: destPath })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                if (this.clipboard.type === 'cut') this.clipboard = null; // Clear if cut
                this.refreshCurrentView();
            } else {
                alert('Paste failed: ' + data.error);
            }
        });
    },

    compressItem(path) {
        const separator = path.includes('\\') ? '\\' : '/';
        const parentDir = path.substring(0, path.lastIndexOf(separator));
        const name = path.substring(path.lastIndexOf(separator) + 1);
        const zipName = name + '.zip';
        const zipPath = parentDir + separator + zipName;

        const finalZipName = prompt("Archive Name:", zipName);
        if (!finalZipName) return;
        
        const finalZipPath = parentDir + separator + finalZipName;

        fetch('/api/zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath: path, zipPath: finalZipPath })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                this.refreshCurrentView();
                alert('Compressed successfully!');
            } else {
                alert('Compression failed: ' + data.error);
            }
        });
    },

    extractItem(path) {
        const separator = path.includes('\\') ? '\\' : '/';
        const parentDir = path.substring(0, path.lastIndexOf(separator));
        // We extract to same directory
        fetch('/api/unzip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zipPath: path, destPath: parentDir })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                this.refreshCurrentView();
                alert('Extracted successfully!');
            } else {
                alert('Extraction failed: ' + data.error);
            }
        });
    },

    refreshCurrentView() {
        // Refresh Explorer Window if it is active
        if (this.currentPath && document.getElementById('fe-grid')) {
            this.loadPath(this.currentPath);
        }
        // Always refresh desktop icons
        this.loadDesktopIcons();
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
                this.refreshCurrentView();
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
                this.refreshCurrentView();
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
                 this.refreshCurrentView();
            }
            else alert(data.error);
        });
    },

    getFileIcon(file) {
        if (file.isDirectory) return '📁';
        const ext = file.name.split('.').pop().toLowerCase();
        
        if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) return '🖼️';
        if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(ext)) return '🎥';
        if (['mp3', 'wav', 'aac', 'flac'].includes(ext)) return '🎵';
        if (['html', 'htm'].includes(ext)) return '🌐';
        if (['js', 'css', 'json', 'py', 'c', 'cpp', 'h', 'ts', 'jsx', 'tsx'].includes(ext)) return '📜';
        if (['md', 'txt', 'log'].includes(ext)) return '📝';
        if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return '🤐';
        if (['pdf'].includes(ext)) return '📚';
        
        return '📄';
    },

    openFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        
        if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
            window.FakeMedia.openImage(file.path, file.name);
        } else if (['mp4', 'webm', 'ogg', 'mov', 'avi'].includes(ext)) {
            window.FakeMedia.openVideo(file.path, file.name);
        } else if (['html', 'htm', 'pdf'].includes(ext)) {
            window.FakeBrowser.open(file.path, file.name);
        } else {
            window.FileEditor.open(file.path);
        }
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

window.FakeMedia = {
    openImage(path, name) {
        WindowManager.createWindow(`Image: ${name}`, 600, 400, (container) => {
            container.innerHTML = `
                <div style="width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; background: #000;">
                    <img src="/api/stream?path=${encodeURIComponent(path)}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
                </div>
            `;
        });
    },
    openVideo(path, name) {
        WindowManager.createWindow(`Video: ${name}`, 600, 400, (container) => {
            container.innerHTML = `
                <div style="width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; background: #000;">
                    <video src="/api/stream?path=${encodeURIComponent(path)}" controls style="max-width: 100%; max-height: 100%; width: 100%;">
                        Your browser does not support the video tag.
                    </video>
                </div>
            `;
        });
    }
};

window.FakeBrowser = {
    open(path, name) {
        const id = 'browser-' + Date.now();
        const defaultUrl = 'https://www.google.com/webhp?igu=1'; // /webhp?igu=1 often allows iframe embedding for Google
        let initialUrl = defaultUrl;
        
        if (path) {
            if (path.startsWith('http://') || path.startsWith('https://')) {
                initialUrl = path;
            } else {
                initialUrl = `/api/stream?path=${encodeURIComponent(path)}`;
            }
        }
        
        const displayUrl = path || defaultUrl;
        const title = name ? `Browser: ${name}` : 'Browser';

        WindowManager.createWindow(title, 800, 600, (container) => {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; height: 100%;">
                    <div style="padding: 5px; background: #333; display: flex; gap: 5px;">
                        <input type="text" id="${id}-url" value="${displayUrl}" style="flex: 1; background: #222; color: white; border: 1px solid #444; padding: 3px;" onkeydown="if(event.key === 'Enter') FakeBrowser.navigate('${id}', this.value)">
                        <button onclick="FakeBrowser.navigate('${id}', document.getElementById('${id}-url').value)">Go</button>
                    </div>
                    <iframe id="${id}-frame" src="${initialUrl}" style="flex: 1; border: none; background: white;"></iframe>
                </div>
            `;
        });
    },
    
    navigate(id, url) {
        const frame = document.getElementById(`${id}-frame`);
        if (frame) {
            // Check if it's a web URL or internal path
            if (url.startsWith('http://') || url.startsWith('https://')) {
                frame.src = url;
            } else if (url === 'about:blank') {
                frame.src = 'about:blank';
            } else {
                // Assume internal path
                frame.src = `/api/stream?path=${encodeURIComponent(url)}`;
            }
        }
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
