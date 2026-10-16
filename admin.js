const $ = (id) => document.getElementById(id);
const SESSION_KEY = "imkon_admin_session";

/* ===== Kirish ===== */
function showApp() {
  $("loginBox").hidden = true;
  $("app").hidden = false;
  $("logout").hidden = false;
  $("dateFilter").value = dateStr();
  renderAttendance();
  renderEmployees();
}

function tryLogin() {
  if ($("pass").value === ADMIN_PASSWORD) {
    sessionStorage.setItem(SESSION_KEY, "1");
    showApp();
  } else {
    $("loginError").textContent = "Parol noto'g'ri. Qaytadan urinib ko'ring.";
  }
}

$("loginBtn").addEventListener("click", tryLogin);
$("pass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });
$("logout").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});
if (sessionStorage.getItem(SESSION_KEY)) showApp();

/* ===== Tablar ===== */
const enrollVideo = $("enrollVideo");
let modelsReady = false;

function selectTab(name) {
  const att = name === "att";
  $("paneAtt").hidden = !att;
  $("paneEmp").hidden = att;
  $("tabAtt").setAttribute("aria-selected", att);
  $("tabEmp").setAttribute("aria-selected", !att);
  if (att) stopCamera(enrollVideo);
  else prepareEnroll();
}
$("tabAtt").addEventListener("click", () => selectTab("att"));
$("tabEmp").addEventListener("click", () => selectTab("emp"));

/* ===== Davomat jadvali ===== */
function renderAttendance() {
  const day = $("dateFilter").value || dateStr();
  const emps = getEmployees();
  const rows = getAttendance()
    .filter((a) => a.date === day)
    .sort((a, b) => a.time.localeCompare(b.time));

  const cameIds = new Set(rows.map((r) => r.empId));
  const absent = emps.filter((e) => !cameIds.has(e.id));
  const lateCount = rows.filter((r) => r.late).length;

  $("sTotal").textContent = emps.length;
  $("sCame").textContent = rows.length;
  $("sLate").textContent = lateCount;
  $("sAbsent").textContent = absent.length;

  const came = rows.map(
    (r) => `<tr>
      <td><strong>${escapeHtml(r.name)}</strong></td>
      <td>${escapeHtml(r.role || "—")}</td>
      <td class="num">${r.time}</td>
      <td><span class="badge ${r.late ? "late" : "ok"}">${r.late ? "Kechikdi" : "Keldi"}</span></td>
    </tr>`
  );
  const missed = absent.map(
    (e) => `<tr>
      <td><strong>${escapeHtml(e.name)}</strong></td>
      <td>${escapeHtml(e.role || "—")}</td>
      <td class="num">—</td>
      <td><span class="badge bad">Kelmadi</span></td>
    </tr>`
  );

  const html = came.concat(missed).join("");
  $("attBody").innerHTML =
    html || `<tr><td colspan="4" class="empty">Xodimlar hali qo'shilmagan. "Xodimlar" bo'limiga o'ting.</td></tr>`;
}
$("dateFilter").addEventListener("change", renderAttendance);

/* ===== CSV ===== */
$("csvBtn").addEventListener("click", () => {
  const day = $("dateFilter").value || dateStr();
  const emps = getEmployees();
  const att = getAttendance().filter((a) => a.date === day);
  const lines = [["Sana", "Xodim", "Lavozim", "Vaqt", "Holat"]];

  emps.forEach((e) => {
    const a = att.find((x) => x.empId === e.id);
    lines.push([day, e.name, e.role || "", a ? a.time : "", a ? (a.late ? "Kechikdi" : "Keldi") : "Kelmadi"]);
  });

  const csv = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `davomat-${day}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ===== Xodimlar ===== */
function renderEmployees() {
  const emps = getEmployees();
  $("empBody").innerHTML = emps.length
    ? emps
        .map(
          (e) => `<tr>
            <td><strong>${escapeHtml(e.name)}</strong></td>
            <td>${escapeHtml(e.role || "—")}</td>
            <td style="text-align:right"><button class="btn danger" data-del="${e.id}">O'chirish</button></td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="empty">Hali xodim yo'q.</td></tr>`;
}

$("empBody").addEventListener("click", (e) => {
  const id = e.target.dataset.del;
  if (!id) return;
  const emp = getEmployees().find((x) => x.id === id);
  if (!emp || !confirm(`${emp.name} ro'yxatdan o'chirilsinmi?`)) return;
  saveEmployees(getEmployees().filter((x) => x.id !== id));
  renderEmployees();
  renderAttendance();
});

function enrollMsg(text, type = "") {
  $("enrollMsg").textContent = text;
  $("enrollMsg").className = "msg " + type;
}

async function prepareEnroll() {
  enrollMsg("Kamera yoqilmoqda…");
  try {
    if (!modelsReady) { await loadModels(); modelsReady = true; }
    await startCamera(enrollVideo);
    enrollMsg("Tayyor. Xodim kameraga qarasin va tugmani bosing.");
  } catch (err) {
    console.error(err);
    enrollMsg("Kamera yoki modellar ishlamadi. Ruxsat bering va Live Server orqali oching.", "err");
  }
}

// 3 ta suratdan o'rtacha yuz "izi" olinadi — aniqroq bo'ladi
async function captureDescriptor() {
  const samples = [];
  for (let i = 0; i < 6 && samples.length < 3; i++) {
    const det = await detectFace(enrollVideo);
    if (det) samples.push(Array.from(det.descriptor));
    await new Promise((r) => setTimeout(r, 400));
  }
  if (samples.length < 3) return null;
  return samples[0].map((_, i) => samples.reduce((s, d) => s + d[i], 0) / samples.length);
}

$("enrollBtn").addEventListener("click", async () => {
  const name = $("empName").value.trim();
  const role = $("empRole").value.trim();
  if (!name) { enrollMsg("Ism familiyani kiriting.", "err"); return; }
  if (!enrollVideo.srcObject) { enrollMsg("Kamera hali tayyor emas.", "err"); return; }

  $("enrollBtn").disabled = true;
  enrollMsg("Yuz olinmoqda… kameraga to'g'ri qarang.");

  const descriptor = await captureDescriptor();
  $("enrollBtn").disabled = false;

  if (!descriptor) { enrollMsg("Yuz aniq topilmadi. Yorug'roq joyda qayta urinib ko'ring.", "err"); return; }

  const emps = getEmployees();
  emps.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name, role, descriptor,
  });
  saveEmployees(emps);

  $("empName").value = "";
  $("empRole").value = "";
  enrollMsg(`${name} qo'shildi.`, "ok");
  renderEmployees();
  renderAttendance();
});

/* ===== Davomat oynasida kimdir kelsa, shu yerda ham darhol ko'rinadi ===== */
window.addEventListener("storage", () => {
  if (!$("app").hidden) { renderAttendance(); renderEmployees(); }
});