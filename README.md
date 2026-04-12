# 🚀 Local Network Speed Test

A lightweight, real-time local network speed test tool designed to measure continuous upload and download performance between devices on your LAN.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-%3E%3D14.0.0-green.svg)
![Express](https://img.shields.io/badge/express-4.21.2-lightgrey.svg)
![WebSocket](https://img.shields.io/badge/websocket-ws-brightgreen.svg)

## ✨ Features

- **Real-time Metrics**: Live updates of download and upload speeds using WebSockets.
- **Continuous Testing**: Runs indefinitely until stopped, allowing for long-term monitoring.
- **Multiple Modes**:
  - **Download Only**: Test your network's download capacity.
  - **Upload Only**: Measure how fast you can send data.
  - **Dual Mode**: Test simultaneous upload and download performance (Full Duplex).
- **Responsive UI**: Modern, dark-themed dashboard that works perfectly on mobile and desktop.
- **No Dependencies on Internet**: Works entirely within your local network (LAN).
- **Network Information**: View server-side network interfaces and system details.

## 🛠️ Technology Stack

- **Backend**: [Node.js](https://nodejs.org/) with [Express](https://expressjs.com/)
- **Real-time Communication**: [ws (WebSocket)](https://github.com/websockets/ws)
- **Frontend**: HTML5, CSS3 (Custom properties, Flexbox/Grid), Vanilla JavaScript
- **Styling**: Modern dark-mode UI with Inter font and CSS gradients.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/local-network-speedtest.git
   cd local-network-speedtest
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Server

Start the speed test server:

```bash
npm start
```

By default, the server listens on **port 1234**. You should see a message in your terminal indicating the server is running and listing the available local IP addresses.

### Custom Port

To run the server on a different port:

```bash
PORT=8080 npm start
```

## 📱 How to Use

1. Start the server on your main machine.
2. Open your web browser and navigate to `http://<your-server-ip>:1234` (e.g., `http://192.168.1.15:1234`).
3. Click **Start** to begin the speed test.
4. Use the toggle buttons to switch between **Download**, **Upload**, or **Both** modes.
5. Click **Stop** to end the test.

## 📊 API Endpoints

- `GET /health`: Simple health check returning `{ "ok": true }`.
- `GET /network-info`: Returns server network interfaces and system platform details.
- `GET /connections`: Returns real-time statistics about active connections and their modes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details (or just use it freely!).

---

Developed with ❤️ for local network enthusiasts.
