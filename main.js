const { app, BrowserWindow } = require("electron");
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 390,
    minHeight: 650,
    resizable: true,
    autoHideMenuBar: true,
    title: "CyberSafe"
  });

  mainWindow.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});