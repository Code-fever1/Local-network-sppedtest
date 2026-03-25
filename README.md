# Local Network Speed Test

Continuous upload/download speed test server for devices on your local network.

## Features

- Access from any device on your LAN via IP + port
- Shows live **download** and **upload** speed on the connected device browser
- Switch mode at runtime:
  - Download only
  - Upload only
  - Both
- No time limit (runs until you press **Stop**)

## Setup

```bash
npm install
npm start
```

Server listens on `0.0.0.0:8080` by default.

## Open from another device

After starting, the server prints local IP URLs like:

- `http://192.168.1.10:8080`

Open one of those URLs from your mobile or any device on the same network.

## Optional port override

```bash
PORT=9000 npm start
```
