const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 1214;
const DOWNLOAD_CHUNK_SIZE = 256 * 1024;
const DOWNLOAD_BUFFER_LOW_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_BUFFER_HIGH_BYTES = 8 * 1024 * 1024;
const MAX_PACKETS_PER_PUMP = 32;
const PUMP_DELAY_ACTIVE_MS = 1;
const PUMP_DELAY_BACKPRESSURE_MS = 4;
const METRICS_INTERVAL_MS = 250;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/network-info', (_req, res) => {
  const interfaces = os.networkInterfaces();
  const networkInfo = {};

  for (const [name, entries] of Object.entries(interfaces)) {
    if (entries) {
      networkInfo[name] = entries.map(entry => ({
        family: entry.family,
        address: entry.address,
        netmask: entry.netmask,
        internal: entry.internal,
        mac: entry.mac,
        cidr: entry.cidr
      }));
    }
  }

  res.json({
    interfaces: networkInfo,
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch()
  });
});

app.get('/connections', (_req, res) => {
  const stats = getConnectionStats();
  const connectionList = Array.from(connections.values()).map(conn => ({
    id: conn.id,
    clientIP: conn.clientIP,
    connectedAt: conn.connectedAt,
    isActive: conn.state.uploadActive || conn.state.downloadActive,
    mode: conn.state.uploadActive && conn.state.downloadActive ? 'both' :
          conn.state.uploadActive ? 'upload' :
          conn.state.downloadActive ? 'download' : 'idle'
  }));

  res.json({
    ...stats,
    connections: connectionList
  });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/speed' });

// Track active connections
const connections = new Map();
let connectionIdCounter = 0;

function getConnectionStats() {
  const stats = {
    activeConnections: connections.size,
    totalUploadBps: 0,
    totalDownloadBps: 0,
    avgLatency: 0
  };

  let latencySum = 0;
  let latencyCount = 0;

  for (const [id, conn] of connections) {
    const now = Date.now();
    const elapsedMs = Math.max(now - conn.state.lastMetricsAt, 1);
    const factor = 1000 / elapsedMs;

    stats.totalUploadBps += conn.state.uploadBytes * factor;
    stats.totalDownloadBps += conn.state.downloadBytes * factor;

    if (conn.latency > 0) {
      latencySum += conn.latency;
      latencyCount++;
    }
  }

  stats.avgLatency = latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0;
  return stats;
}

function generateChunk(size) {
  return Buffer.allocUnsafe(size).fill(0x61);
}

const sharedChunk = generateChunk(DOWNLOAD_CHUNK_SIZE);

wss.on('connection', (socket, req) => {
  const connectionId = ++connectionIdCounter;
  const clientIP = req.socket.remoteAddress;

  console.log(`[${connectionId}] New connection from ${clientIP}`);

  const state = {
    uploadBytes: 0,
    downloadBytes: 0,
    uploadActive: false,
    downloadActive: false,
    stopped: false,
    sendLoopActive: false,
    lastMetricsAt: Date.now(),
  };

  // Track this connection
  connections.set(connectionId, {
    id: connectionId,
    clientIP,
    connectedAt: Date.now(),
    latency: 0,
    state
  });

  const clearSendLoop = () => {
    state.sendLoopActive = false;
  };

  const runDownloadPump = () => {
    if (!state.sendLoopActive || !state.downloadActive || socket.readyState !== WebSocket.OPEN) {
      state.sendLoopActive = false;
      return;
    }

    if (socket.bufferedAmount >= DOWNLOAD_BUFFER_HIGH_BYTES) {
      setTimeout(runDownloadPump, PUMP_DELAY_BACKPRESSURE_MS);
      return;
    }

    let packetsSent = 0;

    while (
      socket.bufferedAmount < DOWNLOAD_BUFFER_LOW_BYTES &&
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

    setTimeout(runDownloadPump, PUMP_DELAY_ACTIVE_MS);
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

    // Get global connection stats
    const globalStats = getConnectionStats();

    socket.send(
      JSON.stringify({
        type: 'metrics',
        uploadBps,
        downloadBps,
        connectionId,
        globalStats,
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
      console.log(`[${connectionId}] Starting test: ${payload.mode}`);
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
      console.log(`[${connectionId}] Stopping test`);
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

    if (payload?.type === 'ping') {
      socket.send(JSON.stringify({
        type: 'pong',
        timestamp: payload.timestamp,
        serverTime: Date.now(),
        connectionId
      }));
      return;
    }
  });

  socket.on('close', () => {
    console.log(`[${connectionId}] Connection closed for ${clientIP}`);
    if (state.stopped) {
      return;
    }
    state.stopped = true;
    clearInterval(metricsTimer);
    stopAll();
    connections.delete(connectionId);
  });

  socket.on('error', (error) => {
    console.log(`[${connectionId}] Socket error:`, error.message);
    clearInterval(metricsTimer);
    stopAll();
    connections.delete(connectionId);
  });
});

function getLocalIPv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push({
          address: entry.address,
          interface: name,
          netmask: entry.netmask,
          cidr: entry.cidr
        });
      }
    }
  }

  return addresses;
}

server.listen(PORT, '0.0.0.0', () => {
  const interfaces = getLocalIPv4Addresses();
  console.log(`Local Network Speed Test running on port ${PORT}`);
  console.log(`Open on this machine: http://localhost:${PORT}`);

  if (interfaces.length > 0) {
    console.log('Open from other devices on your local network:');
    interfaces.forEach((iface) => {
      console.log(`  ${iface.interface}: http://${iface.address}:${PORT} (${iface.cidr})`);
    });
  } else {
    console.log('No external IPv4 interface detected.');
  }
});
