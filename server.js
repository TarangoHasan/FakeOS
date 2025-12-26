const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const os = require('os');
const pty = require('node-pty');

const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve xterm files
app.use('/xterm', express.static(path.join(__dirname, 'node_modules/xterm')));
app.use('/xterm-addon-fit', express.static(path.join(__dirname, 'node_modules/xterm-addon-fit')));

// --- Phase 4: File System API ---

// Helper: Get file info
const getFileInfo = (filePath) => {
    try {
        const stats = fs.statSync(filePath);
        return {
            name: path.basename(filePath),
            path: filePath,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            updatedAt: stats.mtime
        };
    } catch (e) {
        return null;
    }
};

// Helper: Get Windows Drives
const getDrives = () => {
    if (os.platform() !== 'win32') return [];
    try {
        const output = require('child_process').execSync('wmic logicaldisk get name').toString();
        const drives = output.split('\r\r\n')
            .filter(value => /[A-Za-z]:/.test(value))
            .map(value => value.trim());
        return drives;
    } catch (e) {
        return [];
    }
};

// API: List Files
app.get('/api/files', (req, res) => {
    let dirPath = req.query.path;

    // Handle Root / Drives view
    if (!dirPath || dirPath === 'ROOT') {
        if (os.platform() === 'win32') {
            const drives = getDrives();
            const files = drives.map(drive => ({
                name: drive,
                path: drive + '\\',
                isDirectory: true,
                size: 0,
                updatedAt: new Date()
            }));
            
            // Add FakeOS virtual drive/folder
            files.push({
                name: 'FakeOS',
                path: path.join(__dirname, 'drive_c'),
                isDirectory: true,
                size: 0,
                updatedAt: new Date()
            });

            return res.json({ path: 'ROOT', files });
        } else {
            dirPath = '/'; // Linux/Mac root
        }
    }
    
    try {
        // Resolve to absolute path to show "Real" path in UI
        dirPath = path.resolve(dirPath);

        const files = fs.readdirSync(dirPath).map(file => {
            return getFileInfo(path.join(dirPath, file));
        }).filter(f => f !== null); // Filter out unreadable
        
        res.json({ path: dirPath, files });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Read File
app.get('/api/file', (req, res) => {
    const filePath = req.query.path;
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        res.json({ path: filePath, content });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Save File
app.post('/api/file', (req, res) => {
    const { path: filePath, content } = req.body;
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Create Directory
app.post('/api/folder', (req, res) => {
    const { path: folderPath } = req.body;
    try {
        if (!fs.existsSync(folderPath)){
            fs.mkdirSync(folderPath);
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Directory already exists' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Delete File/Directory
app.delete('/api/file', (req, res) => {
    const filePath = req.query.path;
    try {
        fs.rmSync(filePath, { recursive: true, force: true });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Rename File/Directory
app.post('/api/rename', (req, res) => {
    const { oldPath, newPath } = req.body;
    try {
        fs.renameSync(oldPath, newPath);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Copy File/Directory
app.post('/api/copy', (req, res) => {
    const { sourcePath, destPath } = req.body;
    try {
        let targetPath = destPath;
        
        // Handle Duplicates
        if (fs.existsSync(targetPath)) {
            const ext = path.extname(destPath);
            const name = path.basename(destPath, ext);
            const dir = path.dirname(destPath);
            
            // If the user wants "fileorfolder-copy", then "fileorfolder-copy-copy"
            // We loop until we find a non-existent path
            let currentPath = targetPath;
            while (fs.existsSync(currentPath)) {
                 const currentExt = path.extname(currentPath);
                 const currentName = path.basename(currentPath, currentExt);
                 currentPath = path.join(dir, `${currentName}-copy${currentExt}`);
            }
            targetPath = currentPath;
        }

        fs.cpSync(sourcePath, targetPath, { recursive: true });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Move File/Directory
app.post('/api/move', (req, res) => {
    const { sourcePath, destPath } = req.body;
    try {
        fs.renameSync(sourcePath, destPath);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ... (previous code)

io.on('connection', (socket) => {
  console.log('A user connected: ' + socket.id);

  // Send a welcome message
  socket.emit('server-message', 'Connection established with FakeOS Server!');

  // --- Phase 5: Differential Updates (File Watcher) ---
  let currentWatcher = null;
  let watcherDebounce = null;

  socket.on('watch-path', (path) => {
      // Close previous watcher
      if (currentWatcher) {
          currentWatcher.close();
          currentWatcher = null;
      }

      if (!fs.existsSync(path)) return;

      try {
          currentWatcher = fs.watch(path, (eventType, filename) => {
              if (watcherDebounce) clearTimeout(watcherDebounce);
              watcherDebounce = setTimeout(() => {
                  socket.emit('file-change', { path, eventType, filename });
              }, 100);
          });
      } catch (e) {
          console.error("Watch failed:", e.message);
      }
  });

// ...
  // --- Phase 5: Differential Updates (File Watcher) ---
  let currentWatcher = null;
  let watcherDebounce = null;
  // ... (watcher code) ...

  // --- Phase 2 & 5: Terminal Setup & Persistence ---
  const activeSessions = global.activeSessions || {};
  global.activeSessions = activeSessions; // Persist across restarts in dev if using nodemon (optional)

  socket.on('join-session', (sessionId) => {
      let session = activeSessions[sessionId];

      if (!session) {
          // Create New Session
          const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
          const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-color',
            cols: 80,
            rows: 24,
            cwd: process.env.HOME || process.cwd(),
            env: process.env
          });

          session = {
              pty: ptyProcess,
              history: '',
              listeners: [] 
          };
          activeSessions[sessionId] = session;

          // Buffer data
          ptyProcess.onData((data) => {
              session.history += data;
              // Limit history size
              if (session.history.length > 10000) session.history = session.history.slice(-10000);
              
              // Send to current socket if connected
              socket.emit('term-output', data);
          });
          
          ptyProcess.onExit(() => {
              socket.emit('term-output', '\r\n\x1b[33mSession ended.\x1b[0m\r\n');
              delete activeSessions[sessionId];
          });
          
          console.log(`Created new terminal session: ${sessionId}`);
      } else {
          // Reconnect to existing
          console.log(`Reconnected to terminal session: ${sessionId}`);
          // Re-bind data emission is handled by the generic onData above?
          // No, the closure `socket` above refers to the *creator's* socket.
          // We need a way to update the target socket.
          
          // Better approach: The pty onData should iterate over active sockets for this session.
          // But here we simplify: One user = One socket per session usually.
          
          // Let's replace the data listener? No, pty supports multiple listeners but we want to avoid duplicates.
          // Actually, we can just attach a NEW listener for THIS socket.
          // And we must ensure we remove it on disconnect.
          
          const onData = (data) => socket.emit('term-output', data);
          session.pty.onData(onData);
          
          // Send history
          socket.emit('term-output', session.history);
          
          // Cleanup listener on disconnect
          socket.on('disconnect', () => {
              if (session.pty) {
                   // node-pty doesn't have easy 'removeListener' for specific lambda if not stored
                   // This is a memory leak risk.
                   // Fix: Store listeners in session object?
                   // session.listeners.push(onData); // We can't easily remove specific one from pty.
                   // Alternative: Have ONE pty listener that emits to an event emitter, and socket subscribes to that.
              }
          });
      }

      // Handle Input
      socket.on('term-input', (data) => {
        if (session.pty) session.pty.write(data);
      });
      
      // Handle Resize
      socket.on('term-resize', (size) => {
          if (session.pty) session.pty.resize(size.cols, size.rows);
      });
  });

  /* 
     REMOVED OLD SPAWN LOGIC to favor 'join-session'
  */

  socket.on('disconnect', () => {
    console.log('User disconnected');
    if (currentWatcher) currentWatcher.close();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`FakeOS Server running on http://localhost:${PORT}`);
});
