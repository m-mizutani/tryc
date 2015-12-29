'use strict';

const spawn = require('child_process').spawn;
const msgpack = require('msgpack');
const app = require('app');
const BrowserWindow = require('browser-window');
const electron = require("electron");
const ipc = electron.ipcMain;
const path = require('path');

/*
const routes = require('netroute').getInfo();
if (routes.IPv4 === undefined || routes.IPv4.length < 1) {
  throw 'no available interface';
}
const default_route = routes.IPv4[0];
const devourer_path = path.join('bin', os.platform(), 'devourer');
const devourer = spawn(devourer_path, ['-i', default_route.interface , '-o', '-']);
*/

function setup_devourer() {
  const os = require('os');
  const routes = require('netroute').getInfo();
  if (routes.IPv4 === undefined || routes.IPv4.length < 1) {
    throw 'no available interface';
  }
  const devourer_path = path.join('bin', os.platform(), 'devourer');
  const device = routes.IPv4[0].interface;
  const devourer = spawn(devourer_path, ['-i', device , '-o', '-']);
  const interfaces = os.networkInterfaces();

  const addrs = interfaces[device].filter(function(x) {
    return (x.family === 'IPv4');
  }).map(function(x) { return x.address; });
  return {
    proc: devourer,
    device: device,
    addrs: addrs,
  };
}

require('crash-reporter').start();

var mainWindow = null;

app.on('window-all-closed', function() {
  if (process.platform != 'darwin')
    app.quit();
});

app.on('ready', function() {
  const devourer = setup_devourer();
  const devourer_stream = new msgpack.Stream(devourer.proc.stdout);
  
  mainWindow = new BrowserWindow({width: 800, height: 600});
  mainWindow.loadURL('file://' + __dirname + '/index.html');

  // for debug.
  mainWindow.openDevTools(true);

  const init_msg = {
    device: devourer.device,
    addrs: devourer.addrs,
  };  
  setTimeout(function() {
    mainWindow.webContents.send('sys', JSON.stringify(init_msg));
    console.log(init_msg);
  }, 1000);
  
  devourer_stream.addListener('msg', function(msg) {
    // console.log(msg[0]);
    if (mainWindow !== null) {
      mainWindow.webContents.send(msg[0], JSON.stringify(msg[2]));
    }
  });
  devourer.proc.stderr.on('data', function(err) {
    console.log(err);
  });

  // Delete BrowserWindow object when closing window.
  mainWindow.on('closed', function() {
    mainWindow = null;
    // console.log('closed');
  });
});
