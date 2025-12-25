# Gemini Context: FakeOS

## Project Overview
FakeOS is a high-performance, web-native desktop shell designed to run on real Linux hardware. It provides a desktop experience similar to XFCE directly in the browser, rendering the UI locally via the DOM while communicating with the backend to manage real files, processes, and terminals. This architecture avoids the pixel-streaming lag associated with VNC or RDP.

## Project Structure & Status
**Current State:** Phase 1 Complete (Basic Connection Established).
The repository contains the initial server and client implementation for the WebSocket connection.

### Key Directories
*   `server.js`: The Backend (Node.js/Express/Socket.io).
*   `public/`: The Frontend (HTML/CSS/JS).
*   `#Project/`: Contains internal project documentation.
    *   `PROJECT ARCHITECTURE.md`: Detailed technical design and roadmap.
    *   `COMMITS/`: Build/release logs.
*   `README.md`: General project introduction.
*   `RELEASES.md`: Release notes.

## Architecture
The system is divided into two main components:

### 1. The Backend (The Bridge)
*   **Role:** Runs on the real Linux device. Translates between the Web UI and the Linux Kernel.
*   **Tech Stack:** Node.js, Express, Socket.io, node-pty, Chokidar.
*   **Functions:**
    *   Serves the web page.
    *   Maintains real-time WebSocket connection.
    *   Executes shell commands via pseudo-terminals.
    *   Monitors file system changes.

### 2. The Frontend (The Fake OS)
*   **Role:** Runs in the user's browser. Renders the desktop environment.
*   **Tech Stack:** TypeScript or React, Xterm.js, Monaco Editor.
*   **Functions:**
    *   **Window Manager:** Handles drag, resize, z-index.
    *   **Xterm.js:** Renders terminal output.
    *   **Monaco Editor:** Provides code editing capabilities.

## Roadmap (6-Phase Master Plan)
1.  **Phase 1: The Heartbeat (Connection):** [COMPLETE] Setup Express & Socket.io for a secure link.
2.  **Phase 2: The Nerves (Terminal Access):** Implement node-pty and Xterm.js for remote terminal control.
3.  **Phase 3: The Skeleton (Desktop Environment):** Build the UI (Taskbar, Window Wrapper, App Launcher).
4.  **Phase 4: The Eyes (File Explorer & Editor):** JSON-based file explorer and Monaco Editor integration.
5.  **Phase 5: The Brain (Optimization & Persistence):** Differential updates, session persistence, theming.
6.  **Phase 6: The Launchpad (Documentation):** Deployment guides and dependencies (npm install, node server.js).

## Intended Development Commands
*   **Setup:** `npm install`
*   **Run Server:** `node server.js`
*   **Dependencies:** `build-essential`, `python3`, `make` (on host).

## Development Conventions
*   **Style:** XFCE-like desktop metaphor.
*   **Philosophy:** Local rendering over pixel streaming; real-time bidirectional communication.
