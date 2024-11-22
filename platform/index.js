// platform/index.js
const macOS = require('./macos');
const windows = require('./windows');
const os = require('os');

const platformAPI = os.platform() === 'darwin' ? macOS : windows;


module.exports = {platformAPI};