const socket = io();
const statusDiv = document.getElementById('status');
const logDiv = document.getElementById('log');

socket.on('connect', () => {
    statusDiv.textContent = 'Connected to Server';
    statusDiv.classList.add('connected');
    console.log('Connected to server');
});

socket.on('server-message', (msg) => {
    const p = document.createElement('p');
    p.textContent = `Server says: ${msg}`;
    logDiv.appendChild(p);
});

socket.on('disconnect', () => {
    statusDiv.textContent = 'Disconnected';
    statusDiv.classList.remove('connected');
});
