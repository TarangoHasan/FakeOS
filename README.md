# **FakeOS**

### The "Fake" Desktop that's actually Real.



#### FakeOS is a high-performance, Web-Native Desktop Shell designed for real Linux hardware. It provides a full desktop experience (like XFCE) directly in your browser, but without the lag of VNC or RDP.



##### 🚀 Why FakeOS?

Unlike traditional remote desktops that stream pixels (video), FakeOS renders the UI locally using the browser's DOM. It communicates with your device via a lightweight API to manage real files, processes, and terminals.



Fast as Code-Server: No pixel-streaming lag. UI updates at the speed of your browser.



Real File System: Not a simulator. It interacts directly with your server's storage.



XFCE Style: A familiar desktop metaphor with windows, taskbars, and menus.



Web-Native: Built with HTML, CSS, and JavaScript for maximum compatibility.



##### 🛠 How it Works

Backend: A lightweight server (Node.js/Python) runs on your real device.



Frontend: The FakeOS UI renders in your browser.



Bridge: File changes and terminal commands are sent via WebSockets, meaning only data moves, not images.

