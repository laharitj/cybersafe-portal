const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

let mainWindow;
let resetServer;
let resetPort;

function routeResetToken(token) {
  if (!token || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.executeJavaScript(`
    (() => {
      const resetToken = ${JSON.stringify(token)};
      if (typeof window.handleResetToken === "function") {
        window.handleResetToken(resetToken);
      }
      const modal = document.getElementById("forgotModal");
      if (modal) modal.classList.remove("hidden");
      const input = document.getElementById("resetEmail");
      if (input) input.value = resetToken;
      const msg = document.getElementById("resetMsg");
      if (msg) msg.innerText = "Reset link opened. Enter the token in the app.";
      window.RESET_TOKEN = resetToken;
    })();
  `).catch(() => {});
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const tester = http.createServer();
    tester.listen(0, "127.0.0.1", () => {
      const address = tester.address();
      const port = address && address.port;
      tester.close(() => resolve(port));
    });
    tester.on("error", reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 430,
    height: 720,
    resizable: false,
    autoHideMenuBar: true,
    title: "LahariVault"
  });

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.executeJavaScript(`window.RESET_SERVICE_URL = "http://127.0.0.1:${resetPort}";`);
  });

  mainWindow.loadFile("index.html");
}

function waitForResetServer(attempts = 50, port = resetPort) {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/health`, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on("error", () => {
      if (attempts <= 1) {
        resolve(false);
        return;
      }

      setTimeout(() => resolve(waitForResetServer(attempts - 1, port)), 100);
    });
  });
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "laharivault:") {
      const token = parsed.searchParams.get("token");
      routeResetToken(token);
    }
  } catch (error) {
    console.error("Invalid deep link", url, error);
  }
});

app.on("second-instance", (_event, commandLine) => {
  const forwardedUrl = commandLine.find((arg) => arg.startsWith("laharivault://"));
  if (forwardedUrl) {
    const parsed = new URL(forwardedUrl);
    const token = parsed.searchParams.get("token");
    routeResetToken(token);
  }

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  if (!app.isDefaultProtocolClient("laharivault")) {
    app.setAsDefaultProtocolClient("laharivault");
  }

  resetPort = Number(process.env.RESET_PORT || 0);

  if (resetPort > 0) {
    const ready = await waitForResetServer(50, resetPort);
    if (ready) {
      createWindow();
    } else {
      console.error("Configured reset server did not become ready on port", resetPort);
    }
    return;
  }

  resetPort = await getFreePort();

  resetServer = spawn("python", [path.join(__dirname, "server.py")], {
    cwd: __dirname,
    stdio: "pipe",
    windowsHide: true,
    env: {
      ...process.env,
      RESET_PORT: String(resetPort)
    }
  });

  resetServer.stderr.on("data", (data) => {
    console.error(`Reset server error: ${data}`);
  });

  const ready = await waitForResetServer();
  if (ready) {
    createWindow();
  } else {
    console.error("Reset server did not become ready on port", resetPort);
  }
});

app.on("will-quit", () => {
  if (resetServer) {
    resetServer.kill();
  }
});