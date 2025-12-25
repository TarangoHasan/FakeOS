# FakeOS Command Reference

A quick-start guide to the commands used to build and run FakeOS.

## Core Commands

| Command | Action |
| :--- | :--- |
| `npm init -y` | Initializes the Node.js project and creates `package.json`. |
| `npm install express socket.io` | Installs the essential backend framework and real-time engine. |
| `node server.js` | **Actual Start Command:** Runs the server directly (bypasses npm restrictions). |
| `cmd /c start node server.js` | Opens the server in a new, independent terminal window. |
| `npm start` | Standard alias (may be blocked by PowerShell policies). |

## Development Tools

| Tool | Purpose |
| :--- | :--- |
| **Node.js** | The runtime environment for the backend. |
| **Express** | Handles static file serving (HTML/CSS/JS). |
| **Socket.io** | Manages the bidirectional "Heartbeat" connection. |

## Directory Structure
- `/public`: Contains all frontend assets (UI).
- `server.js`: The main bridge between the browser and the system.
