const currency = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

const supabaseUrl = window.SUPABASE_URL || "";
const supabaseAnonKey = window.SUPABASE_ANON_KEY || "";
const supabaseClient = supabaseUrl && supabaseAnonKey
  ? window.supabase.createClient(supabaseUrl, supabaseAnonKey)
  : null;

let roomId = getRoomId();
let people = [];
let expenses = [];
let repayments = [];
let paymentDrafts = [{ id: crypto.randomUUID(), person: "", amount: "" }];

const roomLine = document.querySelector("#roomLine");
const roomUrl = document.querySelector("#roomUrl");
const copyRoomBtn = document.querySelector("#copyRoomBtn");
const copyRoomBtnInline = document.querySelector("#copyRoomBtnInline");
const newRoomBtn = document.querySelector("#newRoomBtn");
const resetBtn = document.querySelector("#resetBtn");
const personForm = document.querySelector("#personForm");
const personName = document.querySelector("#personName");
const peopleList = document.querySelector("#peopleList");
const expenseForm = document.querySelector("#expenseForm");
const expenseTitleInput = document.querySelector("#expenseTitleInput");
const paymentList = document.querySelector("#paymentList");
const addPaymentBtn = document.querySelector("#addPaymentBtn");
const paidTotal = document.querySelector("#paidTotal");
const splitList = document.querySelector("#splitList");
const customShareList = document.querySelector("#customShareList");
const shareTotal = document.querySelector("#shareTotal");
const formError = document.querySelector("#formError");
const repaymentForm = document.querySelector("#repaymentForm");
const repaymentFrom = document.querySelector("#repaymentFrom");
const repaymentTo = document.querySelector("#repaymentTo");
const repaymentAmount = document.querySelector("#repaymentAmount");
const repaymentError = document.querySelector("#repaymentError");
const expenseList = document.querySelector("#expenseList");
const repaymentList = document.querySelector("#repaymentList");
const settlementList = document.querySelector("#settlementList");
const balanceList = document.querySelector("#balanceList");

init();

async function init() {
  updateRoomUi();
  if (!supabaseClient) {
    roomLine.textContent = "請先在 config.js 填入 Supabase URL 和 anon key。";
    personName.disabled = true;
    personForm.querySelector("button").disabled = true;
    render();
    return;
  }

  await loadRoom();
  window.setInterval(loadRoomQuietly, 5000);
}

async function loadRoom() {
  try {
    const room = await getOrCreateRoom(roomId);
    people = room.people || [];
    expenses = room.expenses || [];
    repayments = room.repayments || [];
    render();
  } catch (error) {
    roomLine.textContent = `房間讀取失敗：${error.message}`;
  }
}

async function loadRoomQuietly() {
  const active = document.activeElement;
  const isTyping = active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName);
  if (isTyping) return;
  await loadRoom();
}

async function getOrCreateRoom(id) {
  const { data, error } = await supabaseClient
    .from("rooms")
    .select("data")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (data?.data) return data.data;

  const room = defaultRoom();
  const { error: insertError } = await supabaseClient
    .from("rooms")
    .insert({ id, data: room });
  if (insertError) throw insertError;
  return room;
}

async function saveRoom() {
  if (!supabaseClient) {
    throw new Error("請先在 config.js 填入 Supabase anon key。");
  }
  const data = { people, expenses, repayments };
  const { error } = await supabaseClient
    .from("rooms")
    .upsert({ id: roomId, data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

function defaultRoom() {
  return {
    people: ["小安", "小美", "阿哲"],
    expenses: [
      {
        id: crypto.randomUUID(),
        title: "晚餐",
        payments: [
          { person: "小安", amount: 1000 },
          { person: "小美", amount: 680 },
        ],
        shares: [
          { person: "小安", amount: 560 },
          { person: "小美", amount: 560 },
          { person: "阿哲", amount: 560 },
        ],
        createdAt: new Date().toISOString(),
      },
    ],
    repayments: [
      {
        id: crypto.randomUUID(),
        from: "阿哲",
        to: "小安",
        amount: 300,
        date: new Date().toISOString(),
      },
    ],
  };
}

function render() {
  keepDraftsValid();
  renderPeople();
  renderExpenseControls();
  renderRepaymentControls();
  renderLedger();
  renderResults();
}

function keepDraftsValid() {
  paymentDrafts = paymentDrafts
    .filter((draft) => people.includes(draft.person) || people.length > 0)
    .map((draft) => ({
      ...draft,
      person: people.includes(draft.person) ? draft.person : people[0],
    }));

  if (people.length > 0 && paymentDrafts.length === 0) {
    paymentDrafts = [{ id: crypto.randomUUID(), person: people[0], amount: "" }];
  }
}

function renderPeople() {
  peopleList.innerHTML = "";
  personName.disabled = !supabaseClient;
  personForm.querySelector("button").disabled = !supabaseClient;

  if (!supabaseClient) {
    peopleList.innerHTML = '<p class="empty-state">尚未連接 Supabase，請先填入 anon public key。</p>';
    return;
  }

  if (people.length === 0) {
    peopleList.innerHTML = '<p class="empty-state">還沒有成員。</p>';
    return;
  }

  people.forEach((person) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<strong>${escapeHtml(person)}</strong>`;

    const button = document.createElement("button");
    button.className = "remove-btn";
    button.type = "button";
    button.setAttribute("aria-label", `刪除 ${person}`);
    button.textContent = "x";
    button.addEventListener("click", async () => {
      people = people.filter((entry) => entry !== person);
      expenses = expenses
        .map((expense) => ({
          ...expense,
          payments: expense.payments.filter((payment) => payment.person !== person),
          shares: expense.shares.filter((share) => share.person !== person),
        }))
        .filter((expense) => expense.payments.length > 0 && expense.shares.length > 0);
      repayments = repayments.filter((repayment) => repayment.from !== person && repayment.to !== person);
      await saveRoom();
      render();
    });

    chip.append(button);
    peopleList.append(chip);
  });
}

function renderExpenseControls() {
  const disabled = people.length === 0 || !supabaseClient;
  expenseTitleInput.disabled = disabled;
  addPaymentBtn.disabled = disabled;
  expenseForm.querySelector(".primary-action").disabled = disabled;
  renderPaymentRows();
  renderSplitRows();
  updateFormTotals();
}

function renderPaymentRows() {
  paymentList.innerHTML = "";
  if (people.length === 0) {
    paymentList.innerHTML = '<p class="empty-state">請先新增成員。</p>';
    return;
  }

  paymentDrafts.forEach((draft) => {
    const row = document.createElement("div");
    row.className = "payment-row";
    row.dataset.paymentId = draft.id;
    row.innerHTML = `
      <label>
        付款人
        <select class="payment-person">
          ${people.map((person) => `<option value="${escapeAttribute(person)}" ${person === draft.person ? "selected" : ""}>${escapeHtml(person)}</option>`).join("")}
        </select>
      </label>
      <label>
        付款金額
        <input class="payment-amount" type="number" min="0" step="1" inputmode="decimal" value="${escapeAttribute(draft.amount)}" placeholder="0">
      </label>
      <button class="remove-btn" type="button" aria-label="刪除此付款人">x</button>
    `;
    paymentList.append(row);
  });
}

function renderSplitRows() {
  splitList.innerHTML = "";
  customShareList.innerHTML = "";

  people.forEach((person) => {
    const equalLabel = document.createElement("label");
    equalLabel.className = "split-option";
    equalLabel.innerHTML = `
      <input class="equal-split" type="checkbox" value="${escapeAttribute(person)}" checked>
      <span>${escapeHtml(person)}</span>
    `;
    splitList.append(equalLabel);

    const customLabel = document.createElement("label");
    customLabel.className = "custom-share-row";
    customLabel.innerHTML = `
      <span>${escapeHtml(person)}</span>
      <input class="custom-share" data-person="${escapeAttribute(person)}" type="number" min="0" step="1" inputmode="decimal" placeholder="0">
    `;
    customShareList.append(customLabel);
  });

  setSplitMode(getSplitMode());
}

function renderRepaymentControls() {
  const disabled = people.length < 2 || !supabaseClient;
  const options = people.map((person) => `<option value="${escapeAttribute(person)}">${escapeHtml(person)}</option>`).join("");
  repaymentFrom.innerHTML = options;
  repaymentTo.innerHTML = options;
  if (people.length > 1) repaymentTo.value = people[1];
  repaymentFrom.disabled = disabled;
  repaymentTo.disabled = disabled;
  repaymentAmount.disabled = disabled;
  repaymentForm.querySelector(".primary-action").disabled = disabled;
}

function renderLedger() {
  expenseList.innerHTML = "";
  repaymentList.innerHTML = "";

  if (expenses.length === 0) {
    expenseList.innerHTML = '<p class="empty-state">還沒有花費紀錄。</p>';
  } else {
    expenses.forEach((expense) => {
      const item = document.createElement("article");
      item.className = "expense-item";
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(expense.title)}</strong>
          <div class="expense-meta">付款：${formatPairs(expense.payments)}<br>分攤：${formatPairs(expense.shares)}</div>
        </div>
        <div class="amount">${currency.format(getAmountTotal(expense.payments))}</div>
      `;
      item.append(deleteButton("刪除此花費", async () => {
        expenses = expenses.filter((entry) => entry.id !== expense.id);
        await saveRoom();
        render();
      }));
      expenseList.append(item);
    });
  }

  if (repayments.length === 0) {
    repaymentList.innerHTML = '<p class="empty-state">還沒有還款紀錄。</p>';
  } else {
    repayments.forEach((repayment) => {
      const item = document.createElement("article");
      item.className = "expense-item repayment-item";
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(repayment.from)} 已還 ${escapeHtml(repayment.to)}</strong>
          <div class="expense-meta">${formatDate(repayment.date)}</div>
        </div>
        <div class="amount">${currency.format(repayment.amount)}</div>
      `;
      item.append(deleteButton("刪除此還款", async () => {
        repayments = repayments.filter((entry) => entry.id !== repayment.id);
        await saveRoom();
        render();
      }));
      repaymentList.append(item);
    });
  }
}

function renderResults() {
  const balances = calculateBalances();
  const settlements = calculateSettlements(balances);

  settlementList.innerHTML = "";
  if (settlements.length === 0) {
    settlementList.innerHTML = '<p class="empty-state">目前不需要轉帳。</p>';
  } else {
    settlements.forEach((settlement) => {
      const row = document.createElement("div");
      row.className = "settlement-item settlement-action";
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(settlement.from)} 轉給 ${escapeHtml(settlement.to)}</strong>
          <span>${currency.format(settlement.amount)}</span>
        </div>
        <div class="quick-settle">
          <label>
            <span class="sr-only">還款金額</span>
            <input class="settle-amount" type="number" min="1" step="1" value="${settlement.amount}">
          </label>
          <button class="small-button settle-button" type="button" data-from="${escapeAttribute(settlement.from)}" data-to="${escapeAttribute(settlement.to)}">記錄已還</button>
        </div>
      `;
      settlementList.append(row);
    });
  }

  balanceList.innerHTML = "";
  people.forEach((person) => {
    const balance = Math.round(balances[person] || 0);
    const row = document.createElement("div");
    row.className = "balance-item";
    row.innerHTML = `
      <strong>${escapeHtml(person)}</strong>
      <span class="${balance >= 0 ? "positive" : "negative"}">${balance >= 0 ? "應收" : "應付"} ${currency.format(Math.abs(balance))}</span>
    `;
    balanceList.append(row);
  });
}

function calculateBalances() {
  const balances = Object.fromEntries(people.map((person) => [person, 0]));
  expenses.forEach((expense) => {
    expense.payments.forEach((payment) => {
      if (balances[payment.person] !== undefined) balances[payment.person] += payment.amount;
    });
    expense.shares.forEach((share) => {
      if (balances[share.person] !== undefined) balances[share.person] -= share.amount;
    });
  });
  repayments.forEach((repayment) => {
    if (balances[repayment.from] !== undefined) balances[repayment.from] += repayment.amount;
    if (balances[repayment.to] !== undefined) balances[repayment.to] -= repayment.amount;
  });
  return balances;
}

function calculateSettlements(balances) {
  const debtors = [];
  const creditors = [];
  Object.entries(balances).forEach(([person, amount]) => {
    const rounded = Math.round(amount);
    if (rounded < 0) debtors.push({ person, amount: Math.abs(rounded) });
    if (rounded > 0) creditors.push({ person, amount: rounded });
  });

  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0) settlements.push({ from: debtor.person, to: creditor.person, amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }
  return settlements;
}

function updateDraftFromDom() {
  paymentDrafts = [...paymentList.querySelectorAll(".payment-row")].map((row) => ({
    id: row.dataset.paymentId,
    person: row.querySelector(".payment-person").value,
    amount: row.querySelector(".payment-amount").value,
  }));
}

function updateFormTotals() {
  const payments = getDraftPayments();
  const paid = getAmountTotal(payments);
  const shares = getDraftShares(paid);
  paidTotal.textContent = `已付款合計：${currency.format(paid)}`;
  shareTotal.textContent = `分攤合計：${currency.format(getAmountTotal(shares))}`;
}

function getDraftPayments() {
  return paymentDrafts
    .map((draft) => ({ person: draft.person, amount: Number(draft.amount) }))
    .filter((payment) => people.includes(payment.person) && payment.amount > 0);
}

function getDraftShares(totalPaid) {
  if (getSplitMode() === "custom") {
    return [...customShareList.querySelectorAll(".custom-share")]
      .map((input) => ({ person: input.dataset.person, amount: Number(input.value) }))
      .filter((share) => people.includes(share.person) && share.amount > 0);
  }
  const splitters = [...splitList.querySelectorAll(".equal-split:checked")].map((input) => input.value);
  return splitEvenly(totalPaid, splitters);
}

function splitEvenly(total, splitters) {
  if (splitters.length === 0) return [];
  const base = Math.floor(total / splitters.length);
  let remainder = Math.round(total - base * splitters.length);
  return splitters.map((person) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { person, amount: base + extra };
  });
}

function addPaymentDraft() {
  updateDraftFromDom();
  paymentDrafts.push({ id: crypto.randomUUID(), person: people[0], amount: "" });
  renderExpenseControls();
}

async function addRepayment(from, to, amount) {
  repayments.push({ id: crypto.randomUUID(), from, to, amount, date: new Date().toISOString() });
  await saveRoom();
  render();
}

personForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) {
    roomLine.textContent = "請先在 config.js 填入 Supabase anon key。";
    return;
  }

  const name = personName.value.trim();
  if (!name || people.includes(name)) return;
  try {
    people.push(name);
    personName.value = "";
    await saveRoom();
    render();
  } catch (error) {
    people = people.filter((person) => person !== name);
    roomLine.textContent = `新增失敗：${error.message}`;
    render();
  }
});

addPaymentBtn.addEventListener("click", addPaymentDraft);

paymentList.addEventListener("input", () => {
  updateDraftFromDom();
  updateFormTotals();
});

paymentList.addEventListener("change", () => {
  updateDraftFromDom();
  updateFormTotals();
});

paymentList.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-btn");
  if (!button) return;
  updateDraftFromDom();
  const row = button.closest(".payment-row");
  paymentDrafts = paymentDrafts.filter((draft) => draft.id !== row.dataset.paymentId);
  if (paymentDrafts.length === 0 && people.length > 0) {
    paymentDrafts.push({ id: crypto.randomUUID(), person: people[0], amount: "" });
  }
  renderExpenseControls();
});

expenseForm.addEventListener("change", (event) => {
  if (event.target.name === "splitMode") setSplitMode(event.target.value);
  updateFormTotals();
});

expenseForm.addEventListener("input", (event) => {
  if (event.target.classList.contains("custom-share") || event.target.classList.contains("equal-split")) {
    updateFormTotals();
  }
});

expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  updateDraftFromDom();
  showError(formError, "");

  const title = expenseTitleInput.value.trim() || "未命名花費";
  const payments = getDraftPayments();
  const totalPaid = getAmountTotal(payments);
  const shares = getDraftShares(totalPaid);
  const totalShares = getAmountTotal(shares);

  if (people.length === 0) return showError(formError, "請先新增成員。");
  if (payments.length === 0 || totalPaid <= 0) return showError(formError, "請至少輸入一位付款人和付款金額。");
  if (shares.length === 0 || totalShares <= 0) return showError(formError, "請選擇或輸入分攤者。");
  if (Math.round(totalPaid) !== Math.round(totalShares)) {
    return showError(formError, "付款合計和分攤合計需要相同，才算得出正確結算。");
  }

  expenses.push({
    id: crypto.randomUUID(),
    title,
    payments: combineAmounts(payments),
    shares: combineAmounts(shares),
    createdAt: new Date().toISOString(),
  });

  expenseForm.reset();
  paymentDrafts = [{ id: crypto.randomUUID(), person: people[0], amount: "" }];
  setSplitMode("equal");
  await saveRoom();
  render();
});

repaymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(repaymentError, "");
  const from = repaymentFrom.value;
  const to = repaymentTo.value;
  const amount = Number(repaymentAmount.value);
  if (!from || !to || people.length < 2) return showError(repaymentError, "請至少保留兩位成員。");
  if (from === to) return showError(repaymentError, "還款人和收款人不能是同一個人。");
  if (amount <= 0) return showError(repaymentError, "請輸入還款金額。");
  await addRepayment(from, to, amount);
  repaymentAmount.value = "";
});

settlementList.addEventListener("click", async (event) => {
  const button = event.target.closest(".settle-button");
  if (!button) return;
  const row = button.closest(".settlement-item");
  const amount = Number(row.querySelector(".settle-amount").value);
  if (amount <= 0) return;
  await addRepayment(button.dataset.from, button.dataset.to, amount);
});

copyRoomBtn.addEventListener("click", copyRoomLink);
copyRoomBtnInline.addEventListener("click", copyRoomLink);

newRoomBtn.addEventListener("click", () => {
  const url = new URL(window.location.href);
  url.searchParams.set("room", crypto.randomUUID().slice(0, 8));
  window.location.href = url.href;
});

resetBtn.addEventListener("click", async () => {
  people = [];
  expenses = [];
  repayments = [];
  paymentDrafts = [];
  await saveRoom();
  render();
});

function updateRoomUi() {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  roomUrl.value = url.href;
  roomLine.textContent = `房間：${roomId}`;
  if (window.location.search !== url.search) {
    history.replaceState(null, "", url.href);
  }
}

async function copyRoomLink() {
  roomUrl.select();
  try {
    await navigator.clipboard.writeText(roomUrl.value);
    roomLine.textContent = "房間連結已複製。";
  } catch {
    document.execCommand("copy");
    roomLine.textContent = "房間連結已複製。";
  }
}

function getRoomId() {
  const params = new URLSearchParams(window.location.search);
  const current = params.get("room");
  return current && /^[a-zA-Z0-9-]{4,40}$/.test(current) ? current : crypto.randomUUID().slice(0, 8);
}

function deleteButton(label, onClick) {
  const button = document.createElement("button");
  button.className = "remove-btn";
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.textContent = "x";
  button.addEventListener("click", onClick);
  return button;
}

function getAmountTotal(items) {
  return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

function getSplitMode() {
  return expenseForm.querySelector('input[name="splitMode"]:checked')?.value || "equal";
}

function setSplitMode(mode) {
  splitList.hidden = mode !== "equal";
  customShareList.hidden = mode !== "custom";
}

function formatPairs(items) {
  return items.map((item) => `${escapeHtml(item.person)} ${currency.format(item.amount)}`).join("、");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function showError(target, message) {
  target.textContent = message;
}

function combineAmounts(items) {
  const totals = new Map();
  items.forEach((item) => {
    totals.set(item.person, (totals.get(item.person) || 0) + Number(item.amount));
  });
  return [...totals.entries()].map(([person, amount]) => ({ person, amount }));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
