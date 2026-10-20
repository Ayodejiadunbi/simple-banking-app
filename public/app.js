const $ = (selector) => document.querySelector(selector);
const state = { token: localStorage.getItem("novabank_token"), user: null, mode: "signin" };
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
}[character]));

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function setMessage(element, text, success = false) {
  element.textContent = text;
  element.classList.toggle("success", success);
}

function showAuth() {
  $("#auth-view").classList.remove("hidden");
  $("#dashboard").classList.add("hidden");
  $("#logout").classList.add("hidden");
}

function showDashboard(user) {
  state.user = user;
  $("#auth-view").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
  $("#logout").classList.remove("hidden");
  $("#first-name").textContent = user.fullname.split(" ")[0];
  $("#account-number").textContent = `Account ${user.accountNumber}`;
  $("#balance").textContent = `£${user.balance}`;
}

async function loadAccount() {
  if (!state.token) return showAuth();
  try {
    showDashboard(await api("/account"));
    await loadTransactions();
  } catch {
    localStorage.removeItem("novabank_token"); state.token = null; showAuth();
  }
}

async function loadTransactions() {
  const { transactions } = await api("/transactions?limit=30");
  const list = $("#transaction-list");
  if (!transactions.length) { list.innerHTML = '<p class="empty">No transactions yet.</p>'; return; }
  list.innerHTML = transactions.map((transaction) => {
    const incoming = transaction.type === "deposit" || transaction.recipient?._id === state.user.id;
    const label = transaction.type === "transfer" ? (incoming ? `From ${transaction.sender?.fullname || "account"}` : `To ${transaction.recipient?.fullname || "account"}`) : transaction.type;
    const amount = (transaction.amountPence / 100).toFixed(2);
    return `<article class="transaction"><span class="transaction-icon">${incoming ? "↓" : "↑"}</span><div><strong>${escapeHtml(label[0].toUpperCase() + label.slice(1))}</strong><p><small>${escapeHtml(transaction.reference || "No reference")} · ${new Date(transaction.createdAt).toLocaleDateString()}</small></p></div><strong class="${incoming ? "positive" : "negative"}">${incoming ? "+" : "−"}£${amount}</strong></article>`;
  }).join("");
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  state.mode = tab.dataset.mode;
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
  $("#name-field").classList.toggle("hidden", state.mode !== "signup");
  $("#auth-form button").textContent = state.mode === "signup" ? "Create account" : "Sign in";
  $("#auth-form [name=password]").autocomplete = state.mode === "signup" ? "new-password" : "current-password";
}));

$("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  if (state.mode === "signin") delete payload.fullname;
  try {
    const result = await api(`/${state.mode}`, { method: "POST", body: JSON.stringify(payload) });
    state.token = result.accessToken; localStorage.setItem("novabank_token", state.token);
    setMessage($("#auth-message"), ""); showDashboard(result.user); await loadTransactions();
  } catch (error) { setMessage($("#auth-message"), error.message); }
});

document.querySelectorAll(".money-form").forEach((form) => form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = form.dataset.action;
  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    await api(`/account/${action}`, { method: "POST", body: JSON.stringify(payload) });
    form.reset(); showDashboard(await api("/account")); await loadTransactions();
    setMessage($("#dashboard-message"), `${action[0].toUpperCase() + action.slice(1)} completed.`, true);
  } catch (error) { setMessage($("#dashboard-message"), error.message); }
}));

$("#refresh").addEventListener("click", loadTransactions);
$("#logout").addEventListener("click", () => { localStorage.removeItem("novabank_token"); state.token = null; state.user = null; showAuth(); });
loadAccount();
