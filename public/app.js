const state = { personnel: [], cards: [], schedules: [], dashboard: null, editingPersonId: "" };
let isRefreshing = false;
let scrollTimer = null;
let isUserScrolling = false;

const loginForm = document.querySelector("#login-form");
const loginScreen = document.querySelector("#login-screen");
const appShell = document.querySelector("#app-shell");
const loginMessage = document.querySelector("#login-message");
const statusElement = document.querySelector("#status");

async function api(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error de servidor");
  return data;
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value || "";
  return element.innerHTML;
}

function dayNames(days) {
  const labels = { 0: "Dom", 1: "Lun", 2: "Mar", 3: "Mie", 4: "Jue", 5: "Vie", 6: "Sab" };
  return days.map((day) => labels[day]).join(", ");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderSimpleChart(container, labels, series) {
  const max = Math.max(1, ...series.flatMap((item) => item.values));
  container.innerHTML = labels.map((label, index) => {
    const bars = series.map((serie) => {
      const value = serie.values[index] || 0;
      const percent = Math.max(2, Math.round((value / max) * 100));
      return `
        <div class="chart-row">
          <span class="chart-series" style="--series-color:${serie.color}">${escapeHtml(serie.name)}</span>
          <div class="chart-track">
            <span class="chart-fill" style="--bar-width:${percent}%;--bar-color:${serie.color}"></span>
          </div>
          <strong>${value}</strong>
        </div>`;
    }).join("");
    return `
      <article class="chart-group">
        <div class="chart-label">${escapeHtml(label)}</div>
        <div class="chart-bars">${bars}</div>
      </article>`;
  }).join("");
}

function findLastEntry() {
  if (!state.dashboard?.recent) return null;
  return state.dashboard.recent.find((event) => event.allowed && event.movement === "ingreso") || null;
}

function personForEvent(event) {
  if (!event) return null;
  return state.personnel.find((person) => person.id === event.personnelId)
    || state.personnel.find((person) => person.name === event.name)
    || null;
}

function renderLastEntry() {
  const container = document.querySelector("#last-entry");
  const event = findLastEntry();
  if (!event) {
    container.innerHTML = `
      <div class="last-entry-empty">
        <div class="avatar large-avatar">Sin ingreso</div>
        <div>
          <h3>No hay ingresos registrados</h3>
          <p>Cuando un funcionario ingrese con una tarjeta autorizada, aparecera aqui.</p>
        </div>
      </div>`;
    return;
  }

  const person = personForEvent(event);
  const photo = person?.photo || "";
  container.innerHTML = `
    <div class="last-entry-photo">
      ${photo ? `<img src="${photo}" alt="Foto de ${escapeHtml(event.name)}">` : '<div class="avatar large-avatar">Sin foto</div>'}
    </div>
    <div class="last-entry-info">
      <span class="badge allowed">Ingreso permitido</span>
      <h3>${escapeHtml(event.name)}</h3>
      <p>${escapeHtml(person?.position || "Funcionario registrado")}${person?.group ? ` | ${escapeHtml(person.group)}` : ""}</p>
      <dl>
        <div><dt>Fecha</dt><dd>${new Date(event.createdAt).toLocaleString()}</dd></div>
        <div><dt>UID</dt><dd><code>${escapeHtml(event.uid)}</code></dd></div>
        <div><dt>Dispositivo</dt><dd>${escapeHtml(event.device || "ESP32")}</dd></div>
      </dl>
    </div>`;
}

function renderDashboard() {
  const dashboard = state.dashboard;
  document.querySelector("#stat-personnel").textContent = dashboard.totals.personnel;
  document.querySelector("#stat-cards").textContent = dashboard.totals.activeCards;
  document.querySelector("#stat-today").textContent = dashboard.totals.today;
  document.querySelector("#stat-denied").textContent = dashboard.totals.denied;
  renderLastEntry();

  renderSimpleChart(
    document.querySelector("#daily-chart"),
    dashboard.days.map((item) => item.label),
    [
      { name: "Ingreso", color: "#78e8bc", values: dashboard.days.map((item) => item.ingreso) },
      { name: "Salida", color: "#f5d06f", values: dashboard.days.map((item) => item.salida) },
    ]
  );
  renderSimpleChart(
    document.querySelector("#hourly-chart"),
    dashboard.hours.filter((_, index) => index % 2 === 0).map((item) => item.label),
    [{ name: "Total", color: "#72a7ff", values: dashboard.hours.filter((_, index) => index % 2 === 0).map((item) => item.total) }]
  );

  document.querySelector("#events").innerHTML = dashboard.recent.length
    ? dashboard.recent.map((event) => `
      <tr>
        <td>${new Date(event.createdAt).toLocaleString()}</td>
        <td>${escapeHtml(event.name)}</td>
        <td>${escapeHtml(event.movement)}</td>
        <td><code>${escapeHtml(event.uid)}</code></td>
        <td><span class="badge ${event.allowed ? "allowed" : "denied"}">${event.allowed ? "Permitido" : "Denegado"}</span></td>
      </tr>`).join("")
    : '<tr><td class="empty" colspan="5">Todavia no hay movimientos</td></tr>';
}

function renderPersonnel() {
  const list = document.querySelector("#personnel-list");
  list.innerHTML = state.personnel.length
    ? state.personnel.map((person) => `
      <article class="person-card">
        ${person.photo ? `<img src="${person.photo}" alt="Foto de ${escapeHtml(person.name)}">` : '<div class="avatar">Sin foto</div>'}
        <div>
          <h3>${escapeHtml(person.name)}</h3>
          <p>${escapeHtml(person.position || "Sin cargo")} ${person.group ? `| ${escapeHtml(person.group)}` : ""}</p>
          <small>Doc: ${escapeHtml(person.document || "-")} | Tel: ${escapeHtml(person.phone || "-")}</small>
          <small>${escapeHtml(person.email || "")}</small>
        </div>
        <button class="small" data-edit-person="${person.id}" type="button">Editar</button>
        <button class="small danger" data-delete-person="${person.id}" type="button">Eliminar</button>
      </article>`).join("")
    : '<p class="empty">No hay funcionarios registrados</p>';
}

function renderSelects() {
  const options = state.personnel.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`).join("");
  document.querySelector("#card-person").innerHTML = options || '<option value="">Primero registre un funcionario</option>';
  document.querySelector("#schedule-person").innerHTML = options || '<option value="">Primero registre un funcionario</option>';
  const groups = [...new Set(state.personnel.map((person) => person.group).filter(Boolean))];
  document.querySelector("#group-options").innerHTML = groups.map((group) => `<option value="${escapeHtml(group)}"></option>`).join("");
}

function renderCards() {
  document.querySelector("#cards").innerHTML = state.cards.length
    ? state.cards.map((card) => `
      <tr>
        <td><code>${escapeHtml(card.uid)}</code></td>
        <td>${escapeHtml(card.personnelName)}</td>
        <td><span class="badge ${card.active ? "allowed" : "denied"}">${card.active ? "Activa" : "Bloqueada"}</span></td>
        <td><button class="small danger" data-delete-card="${card.id}" type="button">Eliminar</button></td>
      </tr>`).join("")
    : '<tr><td class="empty" colspan="4">No hay tarjetas registradas</td></tr>';
}

function renderSchedules() {
  document.querySelector("#schedules").innerHTML = state.schedules.length
    ? state.schedules.map((schedule) => {
      const assigned = schedule.assignmentType === "person"
        ? state.personnel.find((person) => person.id === schedule.assignmentId)?.name || "Funcionario eliminado"
        : `Grupo: ${schedule.assignmentId}`;
      return `
      <tr>
        <td>${escapeHtml(schedule.name)}</td>
        <td>${escapeHtml(assigned)}</td>
        <td>${escapeHtml(dayNames(schedule.days))}</td>
        <td>${escapeHtml(schedule.startTime)} - ${escapeHtml(schedule.endTime)}</td>
        <td><button class="small danger" data-delete-schedule="${schedule.id}" type="button">Eliminar</button></td>
      </tr>`;
    }).join("")
    : '<tr><td class="empty" colspan="5">No hay horarios registrados</td></tr>';
}

async function loadAll() {
  if (isRefreshing) return;
  isRefreshing = true;
  statusElement.textContent = "Actualizando...";
  try {
    const [dashboard, personnel, cards, schedules] = await Promise.all([
      api("/api/dashboard"),
      api("/api/personnel"),
      api("/api/cards"),
      api("/api/schedules"),
    ]);
    state.dashboard = dashboard;
    state.personnel = personnel;
    state.cards = cards;
    state.schedules = schedules;
    renderDashboard();
    renderPersonnel();
    renderSelects();
    renderCards();
    renderSchedules();
    statusElement.textContent = "Servidor conectado";
    statusElement.className = "status allowed";
  } finally {
    isRefreshing = false;
  }
}

function showApp() {
  loginScreen.hidden = true;
  appShell.hidden = false;
  loadAll().catch((error) => {
    isRefreshing = false;
    statusElement.textContent = "Sin conexion";
    statusElement.className = "status denied";
    document.querySelector("#events").innerHTML = `<tr><td class="empty" colspan="5">${escapeHtml(error.message)}</td></tr>`;
  });
}

function showLogin(errorMessage = "") {
  appShell.hidden = true;
  loginScreen.hidden = false;
  loginMessage.textContent = errorMessage;
}

async function checkSession() {
  try {
    const session = await api("/api/session");
    session.authenticated ? showApp() : showLogin();
  } catch (error) {
    showLogin(error.message);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(loginForm));
  try {
    await api("/api/login", { method: "POST", body: JSON.stringify(data) });
    loginForm.reset();
    showApp();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.hidden = panel.id !== `tab-${button.dataset.tab}`;
    });
    if (button.dataset.tab === "dashboard" || button.dataset.tab === "indicators") loadAll();
  });
});

document.querySelector("#person-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const existing = state.personnel.find((person) => person.id === state.editingPersonId);
  data.photo = await fileToDataUrl(document.querySelector("#photo-input").files[0]) || existing?.photo || "";
  delete data.photoFile;
  try {
    const url = state.editingPersonId ? `/api/personnel/${state.editingPersonId}` : "/api/personnel";
    const method = state.editingPersonId ? "PUT" : "POST";
    await api(url, { method, body: JSON.stringify(data) });
    state.editingPersonId = "";
    form.reset();
    form.querySelector("button").textContent = "Guardar funcionario";
    document.querySelector("#person-message").textContent = "Funcionario guardado.";
    await loadAll();
  } catch (error) {
    document.querySelector("#person-message").textContent = error.message;
  }
});

document.querySelector("#card-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api("/api/cards", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset();
    document.querySelector("#card-message").textContent = "Tarjeta asociada.";
    await loadAll();
  } catch (error) {
    document.querySelector("#card-message").textContent = error.message;
  }
});

document.querySelector("#schedule-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const assignmentType = formData.get("assignmentType");
  const data = {
    name: formData.get("name"),
    assignmentType,
    assignmentId: assignmentType === "group" ? formData.get("groupName") : formData.get("personId"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    days: formData.getAll("days"),
  };
  try {
    await api("/api/schedules", { method: "POST", body: JSON.stringify(data) });
    form.reset();
    document.querySelector("#schedule-message").textContent = "Horario guardado.";
    await loadAll();
  } catch (error) {
    document.querySelector("#schedule-message").textContent = error.message;
  }
});

document.querySelector("[name='assignmentType']").addEventListener("change", (event) => {
  const group = event.target.value === "group";
  document.querySelector("#schedule-group-label").hidden = !group;
  document.querySelector("#schedule-person-label").hidden = group;
});

document.body.addEventListener("click", async (event) => {
  const editId = event.target.dataset.editPerson;
  if (editId) {
    const person = state.personnel.find((item) => item.id === editId);
    if (!person) return;
    const form = document.querySelector("#person-form");
    ["name", "document", "position", "group", "phone", "email", "address"].forEach((field) => {
      form.elements[field].value = person[field] || "";
    });
    state.editingPersonId = editId;
    form.querySelector("button").textContent = "Actualizar funcionario";
    document.querySelector("#person-message").textContent = "Editando funcionario. Seleccione una nueva foto solo si desea cambiarla.";
    document.querySelector("[data-tab='personnel']").click();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const actions = [
    ["deletePerson", "personnel", "Eliminar funcionario y sus tarjetas?"],
    ["deleteCard", "cards", "Eliminar tarjeta?"],
    ["deleteSchedule", "schedules", "Eliminar horario?"],
  ];
  for (const [key, endpoint, question] of actions) {
    const id = event.target.dataset[key];
    if (id && window.confirm(question)) {
      await api(`/api/${endpoint}/${id}`, { method: "DELETE" });
      await loadAll();
    }
  }
});

document.querySelector("#refresh").addEventListener("click", loadAll);
document.querySelector("#refresh-home").addEventListener("click", loadAll);
document.querySelector("#logout").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  showLogin("Sesion cerrada.");
});

window.addEventListener("scroll", () => {
  isUserScrolling = true;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    isUserScrolling = false;
  }, 600);
}, { passive: true });

function isLivePanelVisible() {
  return !document.querySelector("#tab-dashboard").hidden || !document.querySelector("#tab-indicators").hidden;
}

checkSession();
setInterval(() => {
  if (
    !appShell.hidden &&
    isLivePanelVisible() &&
    !document.hidden &&
    !isUserScrolling
  ) {
    loadAll().catch((error) => {
      isRefreshing = false;
      console.warn("No se pudo actualizar el tablero", error);
    });
  }
}, 30000);
