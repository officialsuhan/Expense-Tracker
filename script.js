(() => {
  "use strict";

  const STORAGE_KEY = "ledger-expense-tracker-v1";
  const CATEGORIES = {
    expense: ["Food & Dining", "Transport", "Shopping", "Bills & Utilities", "Health", "Entertainment", "Education", "Travel", "Other"],
    income: ["Salary", "Freelance", "Business", "Investment", "Gift", "Other"]
  };
  const CATEGORY_COLORS = ["#6468e8", "#37b58a", "#f3b45e", "#ed7585", "#54a9d9", "#9a79dd", "#67c4c4", "#e59b69", "#a0a9b8"];
  const CATEGORY_ICONS = {
    "Food & Dining": "♨", "Transport": "↗", "Shopping": "◇",
    "Bills & Utilities": "▤", "Health": "＋", "Entertainment": "♫",
    "Education": "▱", "Travel": "✈", "Salary": "↙",
    "Freelance": "⌘", "Business": "▦", "Investment": "⌁",
    "Gift": "♡", "Other": "◈"
  };

  const $ = (selector) => document.querySelector(selector);
  const els = {
    totalBalance: $("#total-balance"),
    totalIncome: $("#total-income"),
    totalExpenses: $("#total-expenses"),
    transactionBody: $("#transaction-body"),
    emptyState: $("#empty-state"),
    resultsCount: $("#results-count"),
    search: $("#search-input"),
    typeFilter: $("#type-filter"),
    categoryFilter: $("#category-filter"),
    dateFrom: $("#date-from"),
    dateTo: $("#date-to"),
    resetFilters: $("#reset-filters"),
    openModal: $("#open-modal"),
    closeModal: $("#close-modal"),
    cancelModal: $("#cancel-modal"),
    backdrop: $("#modal-backdrop"),
    form: $("#transaction-form"),
    modalTitle: $("#modal-title"),
    titleInput: $("#title-input"),
    amountInput: $("#amount-input"),
    categoryInput: $("#category-input"),
    dateInput: $("#date-input"),
    formError: $("#form-error"),
    saveButton: $("#save-transaction"),
    clearCompleted: $("#clear-all"),
    exportCsv: $("#export-csv"),
    chartPeriod: $("#chart-period"),
    categoryLegend: $("#category-legend"),
    donutCenter: $("#donut-center"),
    toast: $("#toast"),
    todayLabel: $("#today-label"),
    emptyAdd: $("#empty-add")
  };

  let transactions = loadTransactions();
  let editingId = null;
  let monthlyChart = null;
  let categoryChart = null;
  let toastTimeout = null;

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function loadTransactions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) =>
        item && typeof item.id === "string" &&
        typeof item.title === "string" &&
        Number.isFinite(Number(item.amount)) && Number(item.amount) > 0 &&
        ["income", "expense"].includes(item.type) &&
        typeof item.category === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.date)
      ).map((item) => ({ ...item, amount: Number(item.amount) }));
    } catch (error) {
      console.warn("Could not load saved transactions.", error);
      return [];
    }
  }

  function saveTransactions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
      return true;
    } catch (error) {
      console.error("Could not save transactions.", error);
      showToast("Could not save data. Check your browser storage settings.");
      return false;
    }
  }

  function money(amount) {
    return new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency: "PKR",
      maximumFractionDigits: 2
    }).format(amount);
  }

  function readableDate(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat("en", {
      day: "numeric", month: "short", year: "numeric"
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function populateCategoryOptions() {
    const allCategories = [...new Set([...CATEGORIES.expense, ...CATEGORIES.income])];
    els.categoryFilter.innerHTML = '<option value="all">All categories</option>' +
      allCategories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
    updateFormCategories();
  }

  function updateFormCategories(selected = null) {
    const type = els.form.querySelector('input[name="type"]:checked').value;
    const options = CATEGORIES[type];
    els.categoryInput.innerHTML = options.map((category) =>
      `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
    ).join("");
    if (selected && options.includes(selected)) els.categoryInput.value = selected;
  }

  function getFilteredTransactions() {
    const query = els.search.value.trim().toLowerCase();
    const type = els.typeFilter.value;
    const category = els.categoryFilter.value;
    const from = els.dateFrom.value;
    const to = els.dateTo.value;

    return transactions.filter((item) => {
      const matchesSearch = !query ||
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query);
      return matchesSearch &&
        (type === "all" || item.type === type) &&
        (category === "all" || item.category === category) &&
        (!from || item.date >= from) &&
        (!to || item.date <= to);
    }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  function renderSummary() {
    const income = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
    els.totalBalance.textContent = money(income - expenses);
    els.totalIncome.textContent = money(income);
    els.totalExpenses.textContent = money(expenses);
  }

  function renderTransactions() {
    const filtered = getFilteredTransactions();
    els.transactionBody.replaceChildren();
    els.emptyState.hidden = filtered.length > 0;

    for (const item of filtered) {
      const row = document.createElement("tr");
      const icon = CATEGORY_ICONS[item.category] || "◈";
      const typeLabel = item.type === "income" ? "Income" : "Expense";
      const amountPrefix = item.type === "income" ? "+" : "−";
      row.innerHTML = `
        <td><div class="transaction-name">
          <span class="transaction-symbol ${item.type}">${escapeHtml(icon)}</span>
          <div><div class="transaction-title">${escapeHtml(item.title)}</div>
          <div class="transaction-subtitle">${escapeHtml(typeLabel)}</div></div>
        </div></td>
        <td><span class="category-pill">${escapeHtml(item.category)}</span></td>
        <td>${escapeHtml(readableDate(item.date))}</td>
        <td><span class="type-pill ${item.type}">${item.type === "income" ? "↙" : "↗"} ${typeLabel}</span></td>
        <td class="amount ${item.type}">${amountPrefix}${escapeHtml(money(item.amount))}</td>
        <td><div class="row-actions">
          <button class="icon-button edit" type="button" data-action="edit" data-id="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.title)}" title="Edit">✎</button>
          <button class="icon-button delete" type="button" data-action="delete" data-id="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.title)}" title="Delete">×</button>
        </div></td>`;
      els.transactionBody.append(row);
    }

    els.resultsCount.textContent = `Showing ${filtered.length} of ${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`;
  }

  function getMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function getLastMonths(count) {
    const now = new Date();
    const result = [];
    for (let offset = count - 1; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      result.push({
        key: getMonthKey(date),
        label: new Intl.DateTimeFormat("en", { month: "short" }).format(date),
        yearLabel: String(date.getFullYear()).slice(-2)
      });
    }
    return result;
  }

  function renderCharts() {
    const expenseTransactions = transactions.filter((t) => t.type === "expense");
    const categoryTotals = new Map();
    expenseTransactions.forEach((t) => categoryTotals.set(t.category, (categoryTotals.get(t.category) || 0) + t.amount));
    const sortedCategories = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
    els.donutCenter.innerHTML = `<span>Total spent</span><strong>${escapeHtml(money(totalExpenses))}</strong>`;

    els.categoryLegend.innerHTML = sortedCategories.length
      ? sortedCategories.slice(0, 6).map(([category, amount], index) => `
        <div class="legend-item"><span class="legend-dot" style="background:${CATEGORY_COLORS[index % CATEGORY_COLORS.length]}"></span>
        <span>${escapeHtml(category)}</span><strong>${Math.round(totalExpenses ? amount / totalExpenses * 100 : 0)}%</strong></div>
      `).join("")
      : '<p class="chart-fallback">Add an expense to see your categories.</p>';

    const monthlyFallback = $("#monthly-fallback");
    const categoryFallback = $("#category-fallback");
    if (typeof Chart === "undefined") {
      monthlyFallback.hidden = false;
      categoryFallback.hidden = false;
      return;
    }
    monthlyFallback.hidden = true;
    categoryFallback.hidden = true;

    const months = getLastMonths(Number(els.chartPeriod.value));
    const incomeByMonth = months.map((month) => transactions
      .filter((t) => t.type === "income" && t.date.slice(0, 7) === month.key)
      .reduce((sum, t) => sum + t.amount, 0));
    const expensesByMonth = months.map((month) => transactions
      .filter((t) => t.type === "expense" && t.date.slice(0, 7) === month.key)
      .reduce((sum, t) => sum + t.amount, 0));

    const monthlyCtx = $("#monthly-chart").getContext("2d");
    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(monthlyCtx, {
      type: "bar",
      data: {
        labels: months.map((m) => `${m.label} '${m.yearLabel}`),
        datasets: [
          { label: "Income", data: incomeByMonth, backgroundColor: "#6e73e8", borderRadius: 5, maxBarThickness: 20 },
          { label: "Expenses", data: expensesByMonth, backgroundColor: "#a9dccc", borderRadius: 5, maxBarThickness: 20 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 7, boxHeight: 7, padding: 18, color: "#7e899a", font: { family: "DM Sans", size: 10 } } }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${money(context.raw)}` } } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: "#929bad", font: { family: "DM Sans", size: 10 } } },
          y: { beginAtZero: true, grid: { color: "#eff1f6" }, border: { display: false }, ticks: { color: "#929bad", font: { family: "DM Sans", size: 9 }, callback: (value) => compactMoney(value) } }
        }
      }
    });

    const categoryCtx = $("#category-chart").getContext("2d");
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(categoryCtx, {
      type: "doughnut",
      data: {
        labels: sortedCategories.map(([category]) => category),
        datasets: [{ data: sortedCategories.map(([, amount]) => amount), backgroundColor: sortedCategories.map((_, index) => CATEGORY_COLORS[index % CATEGORY_COLORS.length]), borderWidth: 3, borderColor: "#ffffff", hoverOffset: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "76%",
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.label}: ${money(context.raw)}` } } }
      }
    });
  }

  function compactMoney(value) {
    const number = Number(value);
    if (number >= 1000000) return `Rs ${(number / 1000000).toFixed(1)}m`;
    if (number >= 1000) return `Rs ${(number / 1000).toFixed(0)}k`;
    return `Rs ${number}`;
  }

  function renderAll() {
    renderSummary();
    renderTransactions();
    renderCharts();
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }

  function openModal(transaction = null) {
    editingId = transaction ? transaction.id : null;
    els.form.reset();
    els.formError.hidden = true;
    els.modalTitle.textContent = transaction ? "Edit transaction" : "Add transaction";
    els.saveButton.textContent = transaction ? "Save changes" : "Save transaction";
    els.form.querySelector(`input[name="type"][value="${transaction?.type || "expense"}"]`).checked = true;
    updateFormCategories(transaction?.category || null);
    els.titleInput.value = transaction?.title || "";
    els.amountInput.value = transaction?.amount ?? "";
    els.dateInput.value = transaction?.date || localDateString();
    els.backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => els.titleInput.focus(), 30);
  }

  function closeModal() {
    els.backdrop.hidden = true;
    document.body.style.overflow = "";
    editingId = null;
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    const type = els.form.querySelector('input[name="type"]:checked').value;
    const title = els.titleInput.value.trim();
    const amount = Number(els.amountInput.value);
    const category = els.categoryInput.value;
    const date = els.dateInput.value;

    if (!title || title.length > 80) return showFormError("Please enter a name (up to 80 characters).");
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) return showFormError("Enter an amount greater than 0 and no more than 1,000,000,000.");
    if (!CATEGORIES[type].includes(category)) return showFormError("Choose a valid category.");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return showFormError("Choose a valid date.");

    if (editingId) {
      const index = transactions.findIndex((t) => t.id === editingId);
      if (index === -1) return showFormError("This transaction no longer exists. Please reopen the form.");
      transactions[index] = { ...transactions[index], title, amount, type, category, date };
    } else {
      transactions.push({
        id: makeId(), title, amount, type, category, date,
        createdAt: Date.now()
      });
    }

    saveTransactions();
    closeModal();
    renderAll();
    showToast(editingId ? "Transaction updated." : "Transaction added.");
  }

  function showFormError(message) {
    els.formError.textContent = message;
    els.formError.hidden = false;
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function deleteTransaction(id) {
    const transaction = transactions.find((t) => t.id === id);
    if (!transaction) return;
    if (!window.confirm(`Delete "${transaction.title}"? This cannot be undone.`)) return;
    transactions = transactions.filter((t) => t.id !== id);
    saveTransactions();
    renderAll();
    showToast("Transaction deleted.");
  }

  function exportCsv() {
    const filtered = getFilteredTransactions();
    if (!filtered.length) {
      showToast("There are no transactions to export.");
      return;
    }
    const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ["Date", "Name", "Type", "Category", "Amount (PKR)"],
      ...filtered.map((t) => [t.date, t.title, t.type, t.category, t.amount.toFixed(2)])
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(quote).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ledger-transactions-${localDateString()}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("CSV exported.");
  }

  function clearAllTransactions() {
    if (!transactions.length) return showToast("There are no transactions to clear.");
    if (!window.confirm("Delete ALL transactions? This cannot be undone.")) return;
    transactions = [];
    saveTransactions();
    renderAll();
    showToast("All transactions cleared.");
  }

  function resetFilters() {
    els.search.value = "";
    els.typeFilter.value = "all";
    els.categoryFilter.value = "all";
    els.dateFrom.value = "";
    els.dateTo.value = "";
    renderTransactions();
  }

  els.todayLabel.textContent = new Intl.DateTimeFormat("en", {
    weekday: "short", day: "numeric", month: "short", year: "numeric"
  }).format(new Date());

  populateCategoryOptions();
  els.dateInput.value = localDateString();
  renderAll();

  els.openModal.addEventListener("click", () => openModal());
  els.emptyAdd.addEventListener("click", () => openModal());
  els.closeModal.addEventListener("click", closeModal);
  els.cancelModal.addEventListener("click", closeModal);
  els.backdrop.addEventListener("click", (event) => {
    if (event.target === els.backdrop) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.backdrop.hidden) closeModal();
  });

  els.form.addEventListener("change", (event) => {
    if (event.target.name === "type") updateFormCategories();
  });
  els.form.addEventListener("submit", handleFormSubmit);

  [els.search, els.typeFilter, els.categoryFilter, els.dateFrom, els.dateTo].forEach((control) => {
    control.addEventListener("input", renderTransactions);
    control.addEventListener("change", renderTransactions);
  });
  els.resetFilters.addEventListener("click", resetFilters);
  els.chartPeriod.addEventListener("change", renderCharts);
  els.exportCsv.addEventListener("click", exportCsv);
  els.clearCompleted.addEventListener("click", clearAllTransactions);

  els.transactionBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const transaction = transactions.find((t) => t.id === button.dataset.id);
    if (!transaction) return;
    if (button.dataset.action === "edit") openModal(transaction);
    if (button.dataset.action === "delete") deleteTransaction(transaction.id);
  });
})();
