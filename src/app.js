import { mockData } from "./data/mockData.js";
import { formatCurrency, formatDate, formatPercent } from "./utils/format.js";

const STORAGE_KEY = "tsdb-state-v1";
const today = new Date();

const elements = {
  views: [...document.querySelectorAll(".view")],
  navLinks: [...document.querySelectorAll(".nav-link")],
  title: document.querySelector("#view-title"),
  snapshot: document.querySelector("#snapshot"),
  dashboard: document.querySelector("#dashboard"),
  clients: document.querySelector("#clientes"),
  loans: document.querySelector("#emprestimos"),
  agenda: document.querySelector("#agenda"),
  settings: document.querySelector("#configuracoes"),
  loanClientSelect: document.querySelector("#loan-client-select"),
  paymentLoanSelect: document.querySelector("#payment-loan-select"),
  clientModal: document.querySelector("#client-modal"),
  loanModal: document.querySelector("#loan-modal"),
  paymentModal: document.querySelector("#payment-modal"),
  clientForm: document.querySelector("#client-form"),
  loanForm: document.querySelector("#loan-form"),
  paymentForm: document.querySelector("#payment-form")
};

let state = loadState();

function loadState() {
  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (saved) {
    return JSON.parse(saved);
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mockData));
  return structuredClone(mockData);
}

function persistState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

function formatRelativeDays(dateValue) {
  const diff = Math.ceil((parseDate(dateValue) - today) / 86400000);

  if (diff === 0) {
    return "Hoje";
  }

  if (diff > 0) {
    return `Em ${diff} dia(s)`;
  }

  return `${Math.abs(diff)} dia(s) atrasado(s)`;
}

function getClientById(clientId) {
  return state.clients.find((client) => client.id === clientId);
}

function getPaymentsByLoanId(loanId) {
  return state.payments.filter((payment) => payment.loanId === loanId);
}

function getBaseTarget(loan) {
  const calculated = loan.principal * (1 + loan.rate / 100);
  return loan.manualTarget ?? calculated;
}

function getPaidAmount(loanId) {
  return getPaymentsByLoanId(loanId).reduce((sum, payment) => sum + payment.amount, 0);
}

function getLateDays(loan) {
  const due = parseDate(loan.dueDate);
  const diff = Math.floor((today - due) / 86400000);
  return Math.max(diff, 0);
}

function getCurrentTarget(loan) {
  const target = getBaseTarget(loan);
  const paid = getPaidAmount(loan.id);
  const lateDays = getLateDays(loan);
  const outstanding = Math.max(target - paid, 0);
  const lateCharge = outstanding * (loan.lateFeeRate / 100) * lateDays;

  return target + lateCharge;
}

function getLoanComputed(loan) {
  const client = getClientById(loan.clientId);
  const paidAmount = getPaidAmount(loan.id);
  const baseTarget = getBaseTarget(loan);
  const lateDays = getLateDays(loan);
  const currentTarget = getCurrentTarget(loan);
  const remaining = Math.max(currentTarget - paidAmount, 0);
  const derivedStatus =
    loan.status === "cancelado"
      ? "cancelado"
      : remaining === 0
      ? "quitado"
      : lateDays > 0
        ? "atrasado"
        : differenceInDays(loan.dueDate) <= 3
          ? "vencendo"
          : "ativo";

  return {
    ...loan,
    client,
    baseTarget,
    currentTarget,
    paidAmount,
    remaining,
    lateDays,
    profitExpected: baseTarget - loan.principal,
    profitReceived: Math.max(paidAmount - loan.principal, 0),
    status: derivedStatus
  };
}

function differenceInDays(dateValue) {
  return Math.ceil((parseDate(dateValue) - today) / 86400000);
}

function getComputedLoans() {
  return state.loans
    .map(getLoanComputed)
    .sort((a, b) => parseDate(a.dueDate) - parseDate(b.dueDate));
}

function getMetrics() {
  const loans = getComputedLoans();
  const totalPrincipal = loans.reduce((sum, loan) => sum + loan.principal, 0);
  const totalExpected = loans.reduce((sum, loan) => sum + loan.baseTarget, 0);
  const totalReceived = loans.reduce((sum, loan) => sum + loan.paidAmount, 0);
  const profitExpected = loans.reduce((sum, loan) => sum + loan.profitExpected, 0);
  const profitReceived = loans.reduce((sum, loan) => sum + loan.profitReceived, 0);
  const overdueLoans = loans.filter((loan) => loan.status === "atrasado");
  const dueToday = loans.filter((loan) => differenceInDays(loan.dueDate) === 0);
  const dueThisWeek = loans.filter((loan) => {
    const diff = differenceInDays(loan.dueDate);
    return diff >= 0 && diff <= 7;
  });

  return {
    totalPrincipal,
    totalExpected,
    totalReceived,
    profitExpected,
    profitReceived,
    overdueAmount: overdueLoans.reduce((sum, loan) => sum + loan.remaining, 0),
    overdueCount: overdueLoans.length,
    dueTodayCount: dueToday.length,
    dueThisWeekCount: dueThisWeek.length
  };
}

function statusPill(status) {
  return `<span class="pill pill--${status}">${status}</span>`;
}

function renderSnapshot() {
  const metrics = getMetrics();

  elements.snapshot.innerHTML = `
    <div class="snapshot__item">
      <span class="detail">Lucro previsto</span>
      <strong>${formatCurrency(metrics.profitExpected)}</strong>
    </div>
    <div class="snapshot__item">
      <span class="detail">Recebido</span>
      <strong>${formatCurrency(metrics.totalReceived)}</strong>
    </div>
    <div class="snapshot__item">
      <span class="detail">Em atraso</span>
      <strong>${metrics.overdueCount} cobranca(s)</strong>
    </div>
  `;
}

function renderDashboard() {
  const metrics = getMetrics();
  const loans = getComputedLoans();
  const overdueItems = loans.filter((loan) => loan.status === "atrasado").slice(0, 4);
  const dueSoonItems = loans
    .filter((loan) => ["ativo", "vencendo"].includes(loan.status))
    .slice(0, 4);
  const recentPayments = [...state.payments]
    .sort((a, b) => parseDate(b.paidAt) - parseDate(a.paidAt))
    .slice(0, 5);

  elements.dashboard.innerHTML = `
    <div class="cards-grid">
      ${metricCard("Total emprestado", formatCurrency(metrics.totalPrincipal), "Capital em operacao")}
      ${metricCard("Total previsto", formatCurrency(metrics.totalExpected), "Valor combinado")}
      ${metricCard("Total recebido", formatCurrency(metrics.totalReceived), "Entradas registradas")}
      ${metricCard("Lucro previsto", formatCurrency(metrics.profitExpected), "Margem esperada")}
      ${metricCard("Lucro recebido", formatCurrency(metrics.profitReceived), "Ganho efetivo")}
      ${metricCard("Em atraso", formatCurrency(metrics.overdueAmount), `${metrics.overdueCount} cobranca(s)`)}
    </div>

    <div class="dashboard-grid" style="margin-top: 18px;">
      <section class="panel span-8">
        <p class="eyebrow">Radar</p>
        <h3>Prioridades da semana</h3>
        <div class="stats-row">
          <div class="stat">
            <span class="detail">Vence hoje</span>
            <strong>${metrics.dueTodayCount}</strong>
          </div>
          <div class="stat">
            <span class="detail">Vence ate 7 dias</span>
            <strong>${metrics.dueThisWeekCount}</strong>
          </div>
          <div class="stat">
            <span class="detail">Clientes ativos</span>
            <strong>${state.clients.filter((client) => client.status === "ativo").length}</strong>
          </div>
        </div>
      </section>

      <section class="panel span-4">
        <p class="eyebrow">Base</p>
        <h3>Saude da carteira</h3>
        <div class="stats-row">
          <div class="stat">
            <span class="detail">Emprestimos ativos</span>
            <strong>${loans.filter((loan) => loan.status === "ativo").length}</strong>
          </div>
          <div class="stat">
            <span class="detail">Vencendo</span>
            <strong>${loans.filter((loan) => loan.status === "vencendo").length}</strong>
          </div>
          <div class="stat">
            <span class="detail">Quitados</span>
            <strong>${loans.filter((loan) => loan.status === "quitado").length}</strong>
          </div>
        </div>
      </section>

      <section class="list-card span-6">
        <p class="eyebrow">Atrasos</p>
        <h3>Cobrancas criticas</h3>
        ${renderLoanList(overdueItems, "Sem cobrancas em atraso no momento.")}
      </section>

      <section class="list-card span-6">
        <p class="eyebrow">Agenda</p>
        <h3>Proximos vencimentos</h3>
        ${renderLoanList(dueSoonItems, "Nenhum vencimento proximo cadastrado.")}
      </section>

      <section class="table-card span-12">
        <p class="eyebrow">Historico</p>
        <h3>Ultimos recebimentos</h3>
        ${renderPaymentsTable(recentPayments)}
      </section>
    </div>
  `;
}

function metricCard(title, value, caption) {
  return `
    <article class="metric-card">
      <span>${title}</span>
      <strong>${value}</strong>
      <small>${caption}</small>
    </article>
  `;
}

function renderLoanList(loans, emptyMessage) {
  if (!loans.length) {
    return `<div class="empty-state">${emptyMessage}</div>`;
  }

  return `
    <div class="list">
      ${loans
        .map(
          (loan) => `
            <article class="list-item">
              <div class="list-item__top">
                <strong>${loan.client?.name || "Cliente nao encontrado"}</strong>
                ${statusPill(loan.status)}
              </div>
              <span class="detail">${formatCurrency(loan.remaining)} em aberto</span>
              <span class="detail">Vencimento: ${formatDate(loan.dueDate)} | ${formatRelativeDays(loan.dueDate)}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPaymentsTable(payments) {
  if (!payments.length) {
    return `<div class="empty-state">Nenhum pagamento registrado ainda.</div>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Cliente</th>
          <th>Data</th>
          <th>Metodo</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        ${payments
          .map((payment) => {
            const loan = state.loans.find((item) => item.id === payment.loanId);
            const client = loan ? getClientById(loan.clientId) : null;

            return `
              <tr>
                <td>${client?.name || "-"}</td>
                <td>${formatDate(payment.paidAt)}</td>
                <td>${payment.method || "-"}</td>
                <td>${formatCurrency(payment.amount)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderClients() {
  const loans = getComputedLoans();
  const rows = state.clients.map((client) => {
    const clientLoans = loans.filter((loan) => loan.clientId === client.id);
    const totalOpen = clientLoans.reduce((sum, loan) => sum + loan.remaining, 0);
    const nextDue = clientLoans
      .filter((loan) => loan.remaining > 0)
      .sort((a, b) => parseDate(a.dueDate) - parseDate(b.dueDate))[0];

    return `
      <tr>
        <td>
          <strong>${client.name}</strong>
          <div class="detail">${client.phone || "Sem telefone"}</div>
        </td>
        <td>${statusPill(client.status)}</td>
        <td>${formatCurrency(totalOpen)}</td>
        <td>${nextDue ? formatDate(nextDue.dueDate) : "-"}</td>
        <td>${client.notes || "-"}</td>
      </tr>
    `;
  });

  elements.clients.innerHTML = `
    <section class="table-card">
      <p class="eyebrow">Clientes</p>
      <h3>Base cadastrada</h3>
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Status</th>
            <th>Saldo em aberto</th>
            <th>Proximo vencimento</th>
            <th>Observacoes</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </section>
  `;
}

function renderLoans() {
  const loans = getComputedLoans();

  elements.loans.innerHTML = `
    <section class="table-card">
      <p class="eyebrow">Operacoes</p>
      <h3>Emprestimos cadastrados</h3>
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Principal</th>
            <th>Total base</th>
            <th>Total atual</th>
            <th>Recebido</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${loans
            .map(
              (loan) => `
                <tr>
                  <td>
                    <strong>${loan.client?.name || "-"}</strong>
                    <div class="detail">Vence em ${formatDate(loan.dueDate)}</div>
                  </td>
                  <td>${formatCurrency(loan.principal)}</td>
                  <td>
                    ${formatCurrency(loan.baseTarget)}
                    <div class="detail">${formatPercent(loan.rate)} combinado</div>
                  </td>
                  <td>
                    ${formatCurrency(loan.currentTarget)}
                    <div class="detail">${loan.lateDays ? `${loan.lateDays} dia(s) de atraso` : "Sem atraso"}</div>
                  </td>
                  <td>${formatCurrency(loan.paidAmount)}</td>
                  <td>${statusPill(loan.status)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderAgenda() {
  const loans = getComputedLoans();
  const overdue = loans.filter((loan) => loan.status === "atrasado");
  const dueToday = loans.filter((loan) => differenceInDays(loan.dueDate) === 0);
  const thisWeek = loans.filter((loan) => {
    const diff = differenceInDays(loan.dueDate);
    return diff > 0 && diff <= 7;
  });

  elements.agenda.innerHTML = `
    <div class="split-grid">
      <section class="list-card">
        <p class="eyebrow">Atrasados</p>
        <h3>Cobrancas vencidas</h3>
        ${renderLoanList(overdue, "Sem atrasos registrados.")}
      </section>
      <section class="list-card" style="margin-top: 18px;">
        <p class="eyebrow">Hoje</p>
        <h3>Vencimentos do dia</h3>
        ${renderLoanList(dueToday, "Nenhum vencimento hoje.")}
      </section>
      <section class="list-card" style="margin-top: 18px;">
        <p class="eyebrow">Semana</p>
        <h3>Proximos 7 dias</h3>
        ${renderLoanList(thisWeek, "Nenhum vencimento nesta semana.")}
      </section>
    </div>
  `;
}

function renderSettings() {
  elements.settings.innerHTML = `
    <div class="settings-grid">
      <article class="settings-card">
        <p class="eyebrow">Dados</p>
        <h3>Backup local</h3>
        <p>Exporte os dados em JSON para manter uma copia manual antes de publicar ou mudar de aparelho.</p>
        <button class="action-button" data-action="export-data">Exportar backup</button>
      </article>
      <article class="settings-card">
        <p class="eyebrow">Restauracao</p>
        <h3>Importar base</h3>
        <p>Carregue um arquivo de backup em JSON para restaurar clientes, emprestimos e pagamentos.</p>
        <input id="import-input" type="file" accept="application/json" />
      </article>
      <article class="settings-card">
        <p class="eyebrow">PWA</p>
        <h3>Preparado para GitHub Pages</h3>
        <p>A base ja inclui `manifest` e `service worker`, pronta para seguir para publicacao como PWA instalavel.</p>
      </article>
    </div>
  `;

  const importInput = document.querySelector("#import-input");
  importInput?.addEventListener("change", handleImport);
}

function renderSelectOptions() {
  elements.loanClientSelect.innerHTML = state.clients.length
    ? state.clients.map((client) => `<option value="${client.id}">${client.name}</option>`).join("")
    : `<option value="">Cadastre um cliente primeiro</option>`;

  const activeLoans = getComputedLoans().filter((loan) => loan.remaining > 0);
  elements.paymentLoanSelect.innerHTML = activeLoans.length
    ? activeLoans
        .map(
          (loan) =>
            `<option value="${loan.id}">${loan.client?.name || "Cliente"} | ${formatCurrency(loan.remaining)}</option>`
        )
        .join("")
    : `<option value="">Nenhum emprestimo em aberto</option>`;
}

function renderAll() {
  renderSnapshot();
  renderDashboard();
  renderClients();
  renderLoans();
  renderAgenda();
  renderSettings();
  renderSelectOptions();
}

function switchView(viewId) {
  elements.views.forEach((view) => view.classList.toggle("is-active", view.id === viewId));
  elements.navLinks.forEach((link) =>
    link.classList.toggle("is-active", link.dataset.viewTarget === viewId)
  );

  const activeLabel = elements.navLinks.find((link) => link.dataset.viewTarget === viewId);
  elements.title.textContent = activeLabel?.textContent || "Dashboard";
}

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function resetForm(form) {
  form.reset();
  const dateInput = form.querySelector('input[type="date"]');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
}

function handleClientSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  state.clients.unshift({
    id: createId("cl"),
    name: formData.get("name").trim(),
    phone: formData.get("phone").trim(),
    document: formData.get("document").trim(),
    notes: formData.get("notes").trim(),
    status: "ativo",
    createdAt: new Date().toISOString().slice(0, 10)
  });

  persistState();
  renderAll();
  elements.clientModal.close();
  resetForm(elements.clientForm);
}

function handleLoanSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  state.loans.unshift({
    id: createId("ln"),
    clientId: formData.get("clientId"),
    principal: Number(formData.get("principal")),
    rate: Number(formData.get("rate")),
    issuedAt: formData.get("issuedAt"),
    dueDate: formData.get("dueDate"),
    lateFeeRate: Number(formData.get("lateFeeRate")),
    manualTarget: formData.get("manualTarget") ? Number(formData.get("manualTarget")) : null,
    notes: formData.get("notes").trim(),
    status: "ativo"
  });

  persistState();
  renderAll();
  elements.loanModal.close();
  resetForm(elements.loanForm);
}

function handlePaymentSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  state.payments.unshift({
    id: createId("pm"),
    loanId: formData.get("loanId"),
    paidAt: formData.get("paidAt"),
    amount: Number(formData.get("amount")),
    method: formData.get("method").trim(),
    notes: formData.get("notes").trim()
  });

  persistState();
  renderAll();
  elements.paymentModal.close();
  resetForm(elements.paymentForm);
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tsdb-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function handleImport(event) {
  const [file] = event.target.files || [];

  if (!file) {
    return;
  }

  file
    .text()
    .then((content) => {
      const imported = JSON.parse(content);
      state = imported;
      persistState();
      renderAll();
    })
    .catch(() => {
      window.alert("Nao foi possivel importar este arquivo JSON.");
    });
}

function bindEvents() {
  elements.navLinks.forEach((link) =>
    link.addEventListener("click", () => switchView(link.dataset.viewTarget))
  );

  document.body.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-action]");

    if (!trigger) {
      return;
    }

    const action = trigger.dataset.action;

    if (action === "open-client") {
      elements.clientModal.showModal();
    }

    if (action === "open-loan") {
      if (!state.clients.length) {
        window.alert("Cadastre ao menos um cliente antes de criar um emprestimo.");
        return;
      }

      elements.loanModal.showModal();
    }

    if (action === "open-payment") {
      if (!getComputedLoans().some((loan) => loan.remaining > 0)) {
        window.alert("Nao ha emprestimos em aberto para receber.");
        return;
      }

      elements.paymentModal.showModal();
    }

    if (action === "close-modal") {
      document.getElementById(trigger.dataset.modalId)?.close();
    }

    if (action === "export-data") {
      exportData();
    }
  });

  elements.clientForm.addEventListener("submit", handleClientSubmit);
  elements.loanForm.addEventListener("submit", handleLoanSubmit);
  elements.paymentForm.addEventListener("submit", handlePaymentSubmit);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js");
  }
}

function setInitialDates() {
  const todayValue = new Date().toISOString().slice(0, 10);
  for (const form of [elements.loanForm, elements.paymentForm]) {
    form.querySelectorAll('input[type="date"]').forEach((input, index) => {
      input.value = index === 1 && form === elements.loanForm
        ? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
        : todayValue;
    });
  }
}

bindEvents();
setInitialDates();
renderAll();
registerServiceWorker();
