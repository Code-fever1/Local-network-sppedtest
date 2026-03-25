const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 1214;
const DOWNLOAD_CHUNK_SIZE = 256 * 1024;
const MAX_BUFFERED_BYTES_HIGH = 64 * 1024 * 1024;
const MAX_PACKETS_PER_PUMP = 512;
const METRICS_INTERVAL_MS = 250;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/speed' });

function generateChunk(size) {
  return Buffer.allocUnsafe(size).fill(0x61);
}

const sharedChunk = generateChunk(DOWNLOAD_CHUNK_SIZE);

wss.on('connection', (socket) => {
  const state = {
    uploadBytes: 0,
    downloadBytes: 0,
    uploadActive: false,
    downloadActive: false,
    stopped: false,
    sendLoopActive: false,
    lastMetricsAt: Date.now(),
  };

  const clearSendLoop = () => {
    state.sendLoopActive = false;
  };

  const runDownloadPump = () => {
    if (!state.sendLoopActive || !state.downloadActive || socket.readyState !== WebSocket.OPEN) {
      state.sendLoopActive = false;
      return;
    }

    let packetsSent = 0;

    while (
      socket.bufferedAmount < MAX_BUFFERED_BYTES_HIGH &&
      packetsSent < MAX_PACKETS_PER_PUMP &&
      state.downloadActive &&
      socket.readyState === WebSocket.OPEN
    ) {
      socket.send(sharedChunk, { binary: true }, (err) => {
        if (err) {
          clearSendLoop();
        }
      });
      state.downloadBytes += sharedChunk.length;
      packetsSent += 1;
    }

    setImmediate(runDownloadPump);
  };

  const startSendLoop = () => {
    if (!state.downloadActive || state.sendLoopActive) {
      return;
    }

    state.sendLoopActive = true;
    setImmediate(runDownloadPump);
  };

  const stopAll = () => {
    state.uploadActive = false;
    state.downloadActive = false;
    clearSendLoop();
  };

  const metricsTimer = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const now = Date.now();
    const elapsedMs = Math.max(now - state.lastMetricsAt, 1);
    const factor = 1000 / elapsedMs;
    const uploadBps = state.uploadBytes * factor;
    const downloadBps = state.downloadBytes * factor;

    socket.send(
      JSON.stringify({
        type: 'metrics',
        uploadBps,
        downloadBps,
        at: now,
      })
    );

    state.uploadBytes = 0;
    state.downloadBytes = 0;
    state.lastMetricsAt = now;
  }, METRICS_INTERVAL_MS);

  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      if (state.uploadActive) {
        state.uploadBytes += data.length;
      }
      return;
    }

    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (payload?.type === 'start') {
      state.uploadActive = payload.mode === 'upload' || payload.mode === 'both';
      state.downloadActive = payload.mode === 'download' || payload.mode === 'both';
      state.uploadBytes = 0;
      state.downloadBytes = 0;
      if (!state.downloadActive) {
        clearSendLoop();
      } else {
        startSendLoop();
      }
      return;
    }

    if (payload?.type === 'stop') {
      stopAll();
      return;
    }

    if (payload?.type === 'mode') {
      state.uploadActive = payload.mode === 'upload' || payload.mode === 'both';
      state.downloadActive = payload.mode === 'download' || payload.mode === 'both';
      if (!state.downloadActive) {
        clearSendLoop();
      } else {
        startSendLoop();
      }
      return;
    }
  });

  socket.on('close', () => {
    if (state.stopped) {
      return;
    }
    state.stopped = true;
    clearInterval(metricsTimer);
    stopAll();
  });

  socket.on('error', () => {
    clearInterval(metricsTimer);
    stopAll();
  });
});

function getLocalIPv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return [...new Set(addresses)];
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPv4Addresses();
  console.log(`Local Network Speed Test running on port ${PORT}`);
  console.log(`Open on this machine: http://localhost:${PORT}`);

  if (ips.length > 0) {
    console.log('Open from other devices on your local network:');
    ips.forEach((ip) => console.log(`  http://${ip}:${PORT}`));
  } else {
    console.log('No external IPv4 interface detected.');
  }
});
