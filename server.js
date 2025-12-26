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

// Serve static files from 'site' directory (for documentation)
app.use('/site', express.static(path.join(__dirname, 'site')));

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

// API: Stream File (for media/html)
app.get('/api/stream', (req, res) => {
    const filePath = req.query.path;
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found');
        }
        res.sendFile(path.resolve(filePath));
    } catch (e) {
        res.status(500).send(e.message);
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

// API: Zip Directory/File
app.post('/api/zip', (req, res) => {
    const { sourcePath, zipPath } = req.body;
    const parentDir = path.dirname(sourcePath);
    const name = path.basename(sourcePath);
    
    // Command: tar -a -cf "zipPath" -C "parentDir" "name"
    // We use cwd option in exec to set directory context, simpler than -C sometimes but -C is standard.
    const cmd = `tar -a -cf "${zipPath}" -C "${parentDir}" "${name}"`;
    
    require('child_process').exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error('Zip error:', stderr);
            return res.status(500).json({ error: stderr || error.message });
        }
        res.json({ success: true });
    });
});

// API: Unzip File
app.post('/api/unzip', (req, res) => {
    const { zipPath, destPath } = req.body;
    
    // Ensure dest exists
    if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });

    const cmd = `tar -xf "${zipPath}" -C "${destPath}"`;
    
    require('child_process').exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error('Unzip error:', stderr);
            return res.status(500).json({ error: stderr || error.message });
        }
        res.json({ success: true });
    });
});

// --- Socket.io Logic ---

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
              sockets: new Set()
          };
          activeSessions[sessionId] = session;

          // Buffer data & Broadcast
          ptyProcess.onData((data) => {
              session.history += data;
              // Limit history size
              if (session.history.length > 10000) session.history = session.history.slice(-10000);
              
              // Broadcast to all sockets in this session
              session.sockets.forEach(s => s.emit('term-output', data));
          });
          
          ptyProcess.onExit(() => {
              session.sockets.forEach(s => s.emit('term-output', '\r\n\x1b[33mSession ended.\x1b[0m\r\n'));
              delete activeSessions[sessionId];
          });
          
          console.log(`Created new terminal session: ${sessionId}`);
      }

      // Add current socket to session
      session.sockets.add(socket);
      console.log(`Joined terminal session: ${sessionId}`);

      // Send history
      socket.emit('term-output', session.history);

      // Handle Input
      // We need to remove this listener if socket disconnects to prevent memory leak?
      // Actually socket.on listeners are removed when socket disconnects automatically by socket.io logic usually?
      // No, socket.io removes listeners ON THE SOCKET object.
      // But we are adding a listener TO THE SOCKET object here.
      // `socket.on('term-input', ...)` -> OK.
      socket.on('term-input', (data) => {
        if (session.pty) session.pty.write(data);
      });
      
      // Handle Resize
      socket.on('term-resize', (size) => {
          if (session.pty) session.pty.resize(size.cols, size.rows);
      });

      // Cleanup on disconnect
      socket.on('disconnect', () => {
          session.sockets.delete(socket);
      });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    if (currentWatcher) currentWatcher.close();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`FakeOS Server running on http://localhost:${PORT}`);
});