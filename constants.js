const dataUrl = './clang.json';
let fullData = {};
let network;
const THRESHOLD = 10;
const nameToIdMap = [];
const fieldVisibility = {}; // New: type → { field → boolean }

const container = document.getElementById('network');
