const storageKey = "split-bill-ledger-v2";

const currency = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

const fallbackData = {
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

const savedData = loadData();
let people = savedData.people;
let expenses = savedData.expenses;
let repayments = savedData.repayments;
let paymentDrafts = [{ id: crypto.randomUUID(), person: people[0] || "", amount: "" }];

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
const resetBtn = document.querySelector("#resetBtn");

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
    button.addEventListener("click", () => removePerson(person));

    chip.append(button);
    peopleList.append(chip);
  });
}

function renderExpenseControls() {
  const disabled = people.length === 0;
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
          ${people
            .map(
              (person) =>
                `<option value="${escapeAttribute(person)}" ${person === draft.person ? "selected" : ""}>${escapeHtml(person)}</option>`,
            )
            .join("")}
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
  const disabled = people.length < 2;
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
      const total = getAmountTotal(expense.payments);
      const item = document.createElement("article");
      item.className = "expense-item";
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(expense.title)}</strong>
          <div class="expense-meta">付款：${formatPairs(expense.payments)}<br>分攤：${formatPairs(expense.shares)}</div>
        </div>
        <div class="amount">${currency.format(total)}</div>
      `;

      const button = document.createElement("button");
      button.className = "remove-btn";
      button.type = "button";
      button.setAttribute("aria-label", `刪除 ${expense.title}`);
      button.textContent = "x";
      button.addEventListener("click", () => {
        expenses = expenses.filter((entry) => entry.id !== expense.id);
        saveData();
        render();
      });

      item.append(button);
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

      const button = document.createElement("button");
      button.className = "remove-btn";
      button.type = "button";
      button.setAttribute("aria-label", "刪除此還款紀錄");
      button.textContent = "x";
      button.addEventListener("click", () => {
        repayments = repayments.filter((entry) => entry.id !== repayment.id);
        saveData();
        render();
      });

      item.append(button);
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

function removePerson(person) {
  people = people.filter((entry) => entry !== person);
  expenses = expenses
    .map((expense) => ({
      ...expense,
      payments: expense.payments.filter((payment) => payment.person !== person),
      shares: expense.shares.filter((share) => share.person !== person),
    }))
    .filter((expense) => expense.payments.length > 0 && expense.shares.length > 0);
  repayments = repayments.filter((repayment) => repayment.from !== person && repayment.to !== person);
  saveData();
  render();
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
  const owed = getAmountTotal(shares);

  paidTotal.textContent = `已付款合計：${currency.format(paid)}`;
  shareTotal.textContent = `分攤合計：${currency.format(owed)}`;
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

function addRepayment(from, to, amount) {
  repayments.push({
    id: crypto.randomUUID(),
    from,
    to,
    amount,
    date: new Date().toISOString(),
  });
  saveData();
  render();
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

function saveData() {
  localStorage.setItem(storageKey, JSON.stringify({ people, expenses, repayments }));
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey));
    if (!parsed || !Array.isArray(parsed.people)) return fallbackData;
    return {
      people: parsed.people || [],
      expenses: parsed.expenses || [],
      repayments: parsed.repayments || [],
    };
  } catch {
    return fallbackData;
  }
}

personForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = personName.value.trim();
  if (!name || people.includes(name)) return;

  people.push(name);
  personName.value = "";
  saveData();
  render();
});

addPaymentBtn.addEventListener("click", () => {
  updateDraftFromDom();
  paymentDrafts.push({ id: crypto.randomUUID(), person: people[0], amount: "" });
  renderExpenseControls();
});

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

expenseForm.addEventListener("submit", (event) => {
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
  });

  expenseForm.reset();
  paymentDrafts = [{ id: crypto.randomUUID(), person: people[0], amount: "" }];
  setSplitMode("equal");
  saveData();
  render();
});

repaymentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showError(repaymentError, "");

  const from = repaymentFrom.value;
  const to = repaymentTo.value;
  const amount = Number(repaymentAmount.value);

  if (!from || !to || people.length < 2) return showError(repaymentError, "請至少保留兩位成員。");
  if (from === to) return showError(repaymentError, "還款人和收款人不能是同一個人。");
  if (amount <= 0) return showError(repaymentError, "請輸入還款金額。");

  addRepayment(from, to, amount);
  repaymentAmount.value = "";
});

settlementList.addEventListener("click", (event) => {
  const button = event.target.closest(".settle-button");
  if (!button) return;

  const row = button.closest(".settlement-item");
  const amount = Number(row.querySelector(".settle-amount").value);
  if (amount <= 0) return;

  addRepayment(button.dataset.from, button.dataset.to, amount);
});

resetBtn.addEventListener("click", () => {
  people = [];
  expenses = [];
  repayments = [];
  paymentDrafts = [];
  localStorage.removeItem(storageKey);
  render();
});

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

render();
