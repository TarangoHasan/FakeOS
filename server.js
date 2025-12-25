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
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            fs.rmdirSync(filePath, { recursive: true });
        } else {
            fs.unlinkSync(filePath);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

io.on('connection', (socket) => {
  console.log('A user connected: ' + socket.id);

  // Send a welcome message
  socket.emit('server-message', 'Connection established with FakeOS Server!');

  // --- Phase 2: Terminal Setup ---
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  
  let ptyProcess = null;

  const spawnPty = () => {
      ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || process.cwd(),
        env: process.env
      });

      // Send data from pty to client
      ptyProcess.onData((data) => {
        socket.emit('term-output', data);
      });

      ptyProcess.onExit(() => {
          console.log('PTY exited. Respawning...');
          socket.emit('term-output', '\r\n\x1b[33mSession ended. Respawning...\x1b[0m\r\n');
          // Respawn after a short delay
          setTimeout(spawnPty, 1000);
      });
  };

  spawnPty();

  // Receive data from client and write to pty
  socket.on('term-input', (data) => {
    if (ptyProcess) {
        try {
            ptyProcess.write(data);
        } catch (e) {
            console.error("Write failed (process likely dead):", e.message);
        }
    }
  });
  
  // Handle resize
  socket.on('term-resize', (size) => {
      if (ptyProcess) {
          try {
            ptyProcess.resize(size.cols, size.rows);
          } catch (e) {
              console.error("Resize failed:", e.message);
          }
      }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    if (ptyProcess) {
        ptyProcess.kill();
        ptyProcess = null; // Prevent further access
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`FakeOS Server running on http://localhost:${PORT}`);
});
