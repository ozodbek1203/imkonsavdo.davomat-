/* ===== Sozlamalar ===== */
const ADMIN_PASSWORD = "admin123";   // <-- admin parolini o'zgartiring
const WORK_START = "09:00";          // shundan keyin kelsa "Kechikdi" deb belgilanadi
const MATCH_DISTANCE = 0.5;          // kichikroq = qattiqroq tekshiruv (0.4 - 0.6)
const MODELS_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

/* ===== Ma'lumotlar bazasi (brauzer localStorage) ===== */
const KEY_EMP = "imkon_employees";
const KEY_ATT = "imkon_attendance";

function readList(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}
function writeList(key, list) { localStorage.setItem(key, JSON.stringify(list)); }

const getEmployees = () => readList(KEY_EMP);
const saveEmployees = (l) => writeList(KEY_EMP, l);
const getAttendance = () => readList(KEY_ATT);
const saveAttendance = (l) => writeList(KEY_ATT, l);

/* ===== Vaqt yordamchilari ===== */
const pad = (n) => String(n).padStart(2, "0");
function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function timeStr(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function isLate(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}` > WORK_START;
}

/* ===== Kamera va yuz modellari ===== */
async function loadModels() {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
  ]);
}

async function startCamera(video) {
  if (video.srcObject) return;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

function stopCamera(video) {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}

const detectorOptions = () =>
  new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

async function detectFace(video) {
  return faceapi
    .detectSingleFace(video, detectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}