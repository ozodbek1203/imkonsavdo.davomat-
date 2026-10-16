const video = document.getElementById("video");
const statusBox = document.getElementById("status");
const arrivalsList = document.getElementById("arrivals");
const clockEl = document.getElementById("clock");

let matcher = null;
let lastLabel = null;
let streak = 0;
let holdUntil = 0; // natija ko'rsatilgan vaqtgacha yangi tekshiruv qilmaymiz

/* ----- Soat ----- */
function tickClock() {
  clockEl.textContent = `${dateStr()}  ${timeStr()}`;
}
setInterval(tickClock, 1000);
tickClock();

/* ----- Holat paneli ----- */
function setStatus(state, title, sub = "") {
  statusBox.dataset.state = state;
  statusBox.innerHTML = `${escapeHtml(title)}<small>${escapeHtml(sub)}</small>`;
}

/* ----- Bugungi kelganlar ro'yxati ----- */
function renderArrivals() {
  const today = dateStr();
  const rows = getAttendance()
    .filter((a) => a.date === today)
    .sort((a, b) => b.time.localeCompare(a.time));

  if (!rows.length) {
    arrivalsList.innerHTML = `<li class="empty">Hozircha hech kim kelmagan.</li>`;
    return;
  }
  arrivalsList.innerHTML = rows
    .map(
      (a) => `<li>
        <div class="who"><strong>${escapeHtml(a.name)}</strong><span>${escapeHtml(a.role || "")} · ${a.time}</span></div>
        <span class="badge ${a.late ? "late" : "ok"}">${a.late ? "Kechikdi" : "Keldi"}</span>
      </li>`
    )
    .join("");
}

/* ----- Yuzlarni solishtirish uchun matcher ----- */
function buildMatcher() {
  const emps = getEmployees();
  if (!emps.length) { matcher = null; return; }
  matcher = new faceapi.FaceMatcher(
    emps.map(
      (e) => new faceapi.LabeledFaceDescriptors(e.id, [new Float32Array(e.descriptor)])
    ),
    MATCH_DISTANCE
  );
}

/* ----- Davomatni belgilash ----- */
function markArrival(emp) {
  const now = new Date();
  const today = dateStr(now);
  const list = getAttendance();

  if (list.some((a) => a.empId === emp.id && a.date === today)) {
    const prev = list.find((a) => a.empId === emp.id && a.date === today);
    setStatus("ok", `${emp.name}`, `Siz bugun ${prev.time} da allaqachon belgilangansiz`);
    return;
  }

  const late = isLate(now);
  list.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    empId: emp.id,
    name: emp.name,
    role: emp.role,
    date: today,
    time: timeStr(now),
    late,
  });
  saveAttendance(list);
  renderArrivals();
  setStatus(late ? "late" : "ok", `${emp.name} — keldi`, `${timeStr(now)}${late ? " · kechikdi" : ""}`);
}

/* ----- Asosiy sikl ----- */
async function loop() {
  if (Date.now() < holdUntil) { setTimeout(loop, 300); return; }

  try {
    const det = await detectFace(video);

    if (!det) {
      streak = 0; lastLabel = null;
      setStatus("idle", "Kameraga qarang", "Yuz topilmadi");
    } else if (!matcher) {
      setStatus("unknown", "Xodimlar ro'yxati bo'sh", "Admin panelda xodim qo'shing");
    } else {
      const best = matcher.findBestMatch(det.descriptor);
      if (best.label === "unknown") {
        streak = 0; lastLabel = null;
        setStatus("unknown", "Tanilmadi", "Bu yuz ro'yxatda yo'q");
      } else {
        streak = best.label === lastLabel ? streak + 1 : 1;
        lastLabel = best.label;
        // Xato belgilanmasligi uchun ketma-ket 2 marta bir xil odam chiqishi kerak
        if (streak >= 2) {
          const emp = getEmployees().find((e) => e.id === best.label);
          if (emp) markArrival(emp);
          streak = 0; lastLabel = null;
          holdUntil = Date.now() + 3500;
        } else {
          setStatus("idle", "Tekshirilmoqda…", "Biroz turing");
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
  setTimeout(loop, 400);
}

/* ----- Boshlash ----- */
(async function init() {
  renderArrivals();
  if (typeof faceapi === "undefined") {
    setStatus("unknown", "Kutubxona yuklanmadi", "Internetni tekshiring va sahifani Ctrl+F5 bilan yangilang");
    return;
  }

  try {
    await loadModels();
  } catch (err) {
    console.error("MODEL XATOSI:", err);
    setStatus("unknown", "Yuz modellari yuklanmadi", "Internetni tekshiring va Ctrl+F5 bosing");
    return;
  }

  try {
    setStatus("idle", "Kamerani yoqyapman…", "Ruxsat bering");
    await startCamera(video);
  } catch (err) {
    console.error("KAMERA XATOSI:", err);
    const msg =
      err.name === "NotAllowedError" ? "Kameraga ruxsat berilmagan. Manzil satridagi qulf belgisidan Kamerani \"Allow\" qiling"
      : err.name === "NotFoundError" ? "Kamera topilmadi. Kamera ulanganini tekshiring"
      : err.name === "NotReadableError" ? "Kamera boshqa dastur (Zoom, Telegram...) tomonidan band"
      : "Kamera ochilmadi: " + err.name;
    setStatus("unknown", "Kamera ishlamadi", msg);
    return;
  }

  buildMatcher();
  setStatus("idle", "Kameraga qarang", "Yuzingiz avtomatik taniladi");
  loop();
})();

// Admin paneldan xodim qo'shilsa yoki o'chirilsa, ro'yxat yangilanadi
window.addEventListener("storage", () => { buildMatcher(); renderArrivals(); });