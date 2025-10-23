
const API_BASE = "http://localhost:3001/api";


function askPassword() {
  let pwd = sessionStorage.getItem("ADMIN_TOKEN");
  if (!pwd) {
    pwd = prompt("Mot de passe admin ?");
    if (!pwd) {
      alert("Mot de passe requis pour accéder à l'admin.");
      return null;
    }
    sessionStorage.setItem("ADMIN_TOKEN", pwd);
  }
  return pwd;
}

function authHeaders() {
  const token = sessionStorage.getItem("ADMIN_TOKEN") || "";
  return { "x-admin": token, "Content-Type": "application/json" };
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), ...authHeaders() },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(e.dataset, v);
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

function toast(msg) {
  const t = document.getElementById("toast");
  if (t) { t.textContent = msg; t.style.opacity = 1; setTimeout(()=>t.style.opacity=0, 2500); }
}

async function loadUsers() {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='6'>Chargement...</td></tr>";
  try {
    const data = await fetchJSON(`${API_BASE}/users`);
    const items = data.data || [];
    tbody.innerHTML = "";
    items.forEach(u => {
      tbody.appendChild(el("tr", {},
        el("td", {}, u.user_id ?? "-"),
        el("td", {}, `${u.firstname||""} ${u.lastname||""}`.trim() || "-"),
        el("td", {}, u.email || "-"),
        el("td", {}, u.role || "-"),
        el("td", {}, (u.active===0 ? "Non" : "Oui")),
        el("td", {},
          el("button", { class:"btn", onclick:()=>banUser(u.user_id) }, "Ban"),
          " ",
          el("button", { class:"btn danger", onclick:()=>deleteUser(u.user_id) }, "Supprimer")
        ),
      ));
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6">Erreur: ${e.message}</td></tr>`;
  }
}

async function loadCompanies() {
  const tbody = document.getElementById("companiesTableBody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='5'>Chargement...</td></tr>";
  try {
    const data = await fetchJSON(`${API_BASE}/companies`);
    const items = data.data || [];
    tbody.innerHTML = "";
    items.forEach(c => {
      tbody.appendChild(el("tr", {},
        el("td", {}, c.company_id ?? "-"),
        el("td", {}, c.nom || "-"),
        el("td", {}, c.domaine || "-"),
        el("td", {}, c.email || "-"),
        el("td", {}, el("button", { class:"btn", onclick:()=>alert("Éditer "+(c.company_id||"")) }, "Éditer"))
      ));
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5">Erreur: ${e.message}</td></tr>`;
  }
}

async function loadAds() {
  const tbody = document.getElementById("adsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='7'>Chargement...</td></tr>";
  try {
    const data = await fetchJSON(`${API_BASE}/ads`);
    const items = data.data || [];
    tbody.innerHTML = "";
    items.forEach(a => {
      tbody.appendChild(el("tr", {},
        el("td", {}, a.ad_id ?? "-"),
        el("td", {}, a.title || "-"),
        el("td", {}, a.localisation || "-"),
        el("td", {}, a.contract_type || "-"),
        el("td", {}, a.company_name || a.company || "-"),
        el("td", {}, el("button", { class:"btn", onclick:()=>alert("Éditer "+(a.ad_id||"")) }, "Éditer")),
        el("td", {}, el("button", { class:"btn danger", onclick:()=>deleteAd(a.ad_id) }, "Supprimer")),
      ));
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7">Erreur: ${e.message}</td></tr>`;
  }
}


async function banUser(id) {
  try {
    await fetchJSON(`${API_BASE}/users/ban`, { method:"POST", body: JSON.stringify({ user_id:id, banned:true }) });
    toast("Utilisateur banni"); loadUsers();
  } catch(e){ toast(e.message); }
}

async function deleteUser(id) {
  if (!confirm("Supprimer cet utilisateur ?")) return;
  try {
    await fetchJSON(`${API_BASE}/users/delete`, { method:"POST", body: JSON.stringify({ user_id:id }) });
    toast("Utilisateur supprimé"); loadUsers();
  } catch(e){ toast(e.message); }
}

async function deleteAd(id) {
  if (!confirm("Supprimer cette annonce ?")) return;
  try {
    await fetchJSON(`${API_BASE}/ads/${id}`, { method:"DELETE" });
    toast("Annonce supprimée"); loadAds();
  } catch(e){ toast(e.message); }
}
(function(){
  if (!askPassword()) return;
  loadUsers(); loadCompanies(); loadAds();
})();

