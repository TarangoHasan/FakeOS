# **FakeOS**

### The "Fake" Desktop that's actually Real.

**FakeOS** is a high-performance, Web-Native Desktop Shell designed for real Linux and Windows hardware. It provides a full desktop experience (similar to XFCE) directly in your browser, without the lag of VNC or RDP.

Unlike traditional remote desktops that stream pixels (video), FakeOS renders the UI locally using the browser's DOM. It communicates with your device via a lightweight API to manage real files, processes, and terminals.

---

## **🚀 Features**

*   **🖥️ Desktop Environment**: Fully functional Window Manager with drag, resize, minimize, and maximize capabilities.
*   **📂 File Explorer**:
    *   Navigate your real file system.
    *   Create, Rename, Delete, Copy, Paste, Move files and folders.
    *   **Drag & Drop** support for moving files.
    *   **Zip/Unzip** support (requires `tar`).
*   **💻 Terminal**: Full access to your system shell (Bash/PowerShell) via `node-pty` and `xterm.js`.
    *   **Session Persistence**: Reload the page without losing your running processes.
*   **📝 Monaco Editor**: Edit code and text files with VS Code's editor engine.
*   **🎬 Media Viewer**: Native support for viewing Images (PNG, JPG, SVG) and Videos (MP4, WEBM).
*   **🌐 FakeBrowser**: Built-in HTML viewer and web browser (iframe-based).
*   **🎨 Theming**:
    *   Customizable Accent Colors and Background Colors.
    *   Set custom Wallpapers (URL).
    *   Themes persist across sessions.
*   **⚡ Real-Time**: File changes on the server are instantly reflected in the UI.

---

## **🛠️ Prerequisites**

*   **Node.js** (v14 or higher)
*   **npm** (Node Package Manager)
*   **System Tools**:
    *   **Windows**: `tar` (usually built-in on modern Windows 10/11) for Zip support.
    *   **Linux**: `build-essential`, `python3`, `make` (required for building `node-pty`).

---

## **📥 Installation**

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/TarangoHasan/FakeOS.git
    cd FakeOS
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```
    *Note: On Linux, this may compile native modules. Ensure you have the prerequisites installed.*

---

## **▶️ Usage**

1.  **Start the Server**:
    ```bash
    node server.js
    ```
    *By default, the server runs on port 3000.*

2.  **Access the Desktop**:
    Open your web browser and navigate to:
    ```
    http://localhost:3000
    ```

3.  **Login**:
    *   Currently, FakeOS runs in single-user mode without authentication. **Do not expose this port to the public internet** without adding a reverse proxy (Nginx) with Basic Auth or implementing middleware.

---

## **🔧 Configuration**

*   **Port**: You can change the port by setting the `PORT` environment variable.
    ```bash
    PORT=8080 node server.js
    ```

---

## **🤝 Contributing**

This project is under active development.
*   **Frontend**: Located in `public/`. modifying `style.css` or `client.js`.
*   **Backend**: Located in `server.js`.

---

## **📄 License**

MIT License.