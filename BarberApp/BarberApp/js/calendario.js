// ============================================================
// CALENDÁRIO (seletor de data sempre em português)
//
// Substitui o <input type="date"> do navegador, que segue o idioma do
// aparelho: num celular em inglês, a data aparecia como mm/dd/yyyy.
//
// No HTML:
//   <div class="date-picker" id="data-picker">
//     <input type="hidden" id="data" />              guarda a data (AAAA-MM-DD)
//     <button type="button" class="date-picker-trigger" id="data-botao">
//       <span class="date-picker-text"></span>       texto que aparece no campo
//     </button>
//   </div>
//
// O valor continua no input escondido, no mesmo formato do campo antigo
// (AAAA-MM-DD), e cada escolha dispara o evento "change" nele. Assim o
// resto do app.js lê a data como antes.
//
// O painel do calendário é colocado no <body>, e não dentro do formulário:
// o painel do formulário corta o que passa da borda (overflow: hidden).
// ============================================================

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const DIAS_CURTOS = ["D", "S", "T", "Q", "Q", "S", "S"];

const pad = n => String(n).padStart(2, "0");
const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);
const isISO = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "");
const toISO = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`; // month: 0 = janeiro

function parts(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month: month - 1, day };
}

// As contas usam UTC para o fuso ou o horário de verão do aparelho não trocarem o dia
function utcDate(iso) {
  const { year, month, day } = parts(iso);
  return new Date(Date.UTC(year, month, day));
}

function fromUTC(date) {
  return toISO(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function weekdayOf(iso) {
  return utcDate(iso).getUTCDay(); // 0 = domingo
}

export function weekdayName(iso) {
  return DIAS[weekdayOf(iso)];
}

function addDays(iso, amount) {
  const date = utcDate(iso);
  date.setUTCDate(date.getUTCDate() + amount);
  return fromUTC(date);
}

// Mesmo dia em outro mês; 31/01 + 1 mês vira 28/02 (ou 29/02)
function addMonths(iso, amount) {
  const { year, month, day } = parts(iso);
  const lastDay = new Date(Date.UTC(year, month + amount + 1, 0)).getUTCDate();
  return fromUTC(new Date(Date.UTC(year, month + amount, Math.min(day, lastDay))));
}

const firstOfMonth = iso => `${iso.slice(0, 8)}01`;

// 19/11/2026
export function formatBR(iso) {
  const { year, month, day } = parts(iso);
  return `${pad(day)}/${pad(month + 1)}/${year}`;
}

// quarta-feira, 19 de novembro de 2026 (para o leitor de tela)
function formatLong(iso) {
  const { year, month, day } = parts(iso);
  return `${weekdayName(iso)}, ${day} de ${MESES[month]} de ${year}`;
}

// Hoje no relógio do aparelho; o app.js passa o "hoje" no fuso da barbearia
function deviceToday() {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth(), now.getDate());
}

export function createDatePicker(root, {
  label = "Data",               // nome do campo, para o leitor de tela
  placeholder = "Selecione a data",
  text = formatBR,              // texto do campo para uma data escolhida
  today = deviceToday,          // função que devolve o dia de hoje (AAAA-MM-DD)
  min = () => "",               // primeira data permitida; "" = sem limite
  isDisabled = () => false,     // outros dias bloqueados (ex.: folga do barbeiro)
  clearable = false,            // mostra o botão de limpar (no filtro)
  clearLabel = "Limpar"
} = {}) {
  const input = root.querySelector('input[type="hidden"]');
  const trigger = root.querySelector(".date-picker-trigger");
  const textEl = root.querySelector(".date-picker-text");

  let popup = null;   // painel aberto
  let month = "";     // 1º dia do mês exibido
  let focused = "";   // dia que recebe o foco do teclado

  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");

  const blocked = iso => Boolean(min() && iso < min()) || isDisabled(iso);

  function updateText() {
    const value = input.value;
    const shown = value ? text(value) : placeholder;
    textEl.textContent = shown;
    trigger.classList.toggle("is-empty", !value);
    trigger.setAttribute("aria-label", `${label}: ${shown}`);
  }

  function setValue(iso, { silent = false } = {}) {
    input.value = isISO(iso) ? iso : "";
    updateText();
    if (!silent) input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function render(focusTarget) {
    const { year, month: monthIndex } = parts(month);
    const todayISO = today();
    const minISO = min();
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    // Mês anterior inteiro antes do mínimo: não há o que escolher lá
    const prevDisabled = Boolean(minISO) && addDays(month, -1) < minISO;

    let cells = "";
    for (let i = 0; i < weekdayOf(month); i++) cells += `<div class="dp-day dp-empty"></div>`;
    for (let day = 1; day <= lastDay; day++) {
      const iso = toISO(year, monthIndex, day);
      const off = blocked(iso);
      const classes = ["dp-day"];
      if (iso === input.value) classes.push("is-selected");
      if (iso === todayISO) classes.push("is-today");
      cells += `<button type="button" class="${classes.join(" ")}" data-date="${iso}"
        tabindex="${iso === focused ? 0 : -1}" aria-pressed="${iso === input.value}"
        aria-label="${formatLong(iso)}${off ? ", indisponível" : ""}"
        ${iso === todayISO ? 'aria-current="date"' : ""} ${off ? 'aria-disabled="true"' : ""}>${day}</button>`;
    }

    popup.innerHTML = `
      <div class="dp-header">
        <button type="button" class="dp-nav" data-move="-1" aria-label="Mês anterior" ${prevDisabled ? "disabled" : ""}>
          <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
        </button>
        <div class="dp-title" aria-live="polite">${capitalize(MESES[monthIndex])} de ${year}</div>
        <button type="button" class="dp-nav" data-move="1" aria-label="Próximo mês">
          <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </button>
      </div>
      <div class="dp-weekdays" aria-hidden="true">
        ${DIAS_CURTOS.map((short, i) => `<abbr title="${DIAS[i]}">${short}</abbr>`).join("")}
      </div>
      <div class="dp-grid">${cells}</div>
      <div class="dp-footer">
        <button type="button" class="dp-action" data-action="today" ${blocked(todayISO) ? "disabled" : ""}>Hoje</button>
        ${clearable ? `<button type="button" class="dp-action" data-action="clear">${clearLabel}</button>` : ""}
      </div>`;

    // Recoloca o foco: o conteúdo do painel foi redesenhado
    const target = focusTarget === "day"
      ? popup.querySelector(`[data-date="${focused}"]`)
      : focusTarget ? popup.querySelector(`[data-move="${focusTarget}"]:not([disabled])`) : null;
    (target || (focusTarget ? popup.querySelector(`[data-date="${focused}"]`) : null))?.focus();
  }

  // Abre embaixo do campo; se não couber, em cima; e não passa da lateral da tela.
  // Alinha pela caixa inteira (no filtro, ela inclui o ícone antes do texto).
  function position() {
    const rect = root.getBoundingClientRect();
    const width = popup.offsetWidth, height = popup.offsetHeight;
    const viewportWidth = document.documentElement.clientWidth;

    let left = rect.left;
    if (left + width > viewportWidth - 8) left = rect.right - width;
    left = Math.max(8, Math.min(left, viewportWidth - 8 - width));

    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8 && rect.top - height - 6 >= 8) top = rect.top - height - 6;

    popup.style.left = `${left + window.scrollX}px`;
    popup.style.top = `${top + window.scrollY}px`;

    // Não coube nem embaixo nem em cima: rola a página até o calendário aparecer inteiro
    const overflow = top + height - (window.innerHeight - 8);
    if (overflow > 0) window.scrollBy({ top: overflow });
  }

  function open() {
    if (popup || trigger.disabled) return;
    let start = input.value || today();
    if (min() && start < min()) start = min();
    focused = start;
    month = firstOfMonth(start);

    popup = document.createElement("div");
    popup.className = "date-picker-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-label", `Calendário: ${label}`);
    popup.addEventListener("click", onClick);
    popup.addEventListener("keydown", onKeydown);
    document.body.append(popup);

    render();
    position();
    trigger.setAttribute("aria-expanded", "true");
    popup.querySelector(`[data-date="${focused}"]`)?.focus({ preventScroll: true });

    document.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("resize", onResize);
  }

  function close(returnFocus = false) {
    if (!popup) return;
    popup.remove();
    popup = null;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("resize", onResize);
    if (returnFocus) trigger.focus();
  }

  function choose(iso) {
    setValue(iso);
    close(true);
  }

  function onClick(event) {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;

    if (button.dataset.move) {
      const move = Number(button.dataset.move);
      focused = addMonths(focused, move);
      if (min() && focused < min()) focused = min();
      month = firstOfMonth(focused);
      render(String(move));
    } else if (button.dataset.date) {
      if (button.getAttribute("aria-disabled") !== "true") choose(button.dataset.date);
    } else if (button.dataset.action === "today") {
      choose(today());
    } else if (button.dataset.action === "clear") {
      choose("");
    }
  }

  // Teclado: setas andam pelos dias, PageUp/PageDown trocam o mês, Esc fecha
  function onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }

    // O foco fica dentro do calendário enquanto ele está aberto
    if (event.key === "Tab") {
      const items = [...popup.querySelectorAll("button:not([disabled])")].filter(b => b.tabIndex >= 0);
      const index = items.indexOf(document.activeElement);
      event.preventDefault();
      items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
      return;
    }

    if (!event.target.dataset?.date) return;
    const moves = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekdayOf(focused)),
      End: () => addDays(focused, 6 - weekdayOf(focused)),
      PageUp: () => addMonths(focused, -1),
      PageDown: () => addMonths(focused, 1)
    };
    if (!moves[event.key]) return;

    event.preventDefault();
    let next = moves[event.key]();
    if (min() && next < min()) next = min();
    focused = next;
    month = firstOfMonth(next);
    render("day");
  }

  function onOutside(event) {
    if (!popup.contains(event.target) && !trigger.contains(event.target)) close();
  }

  function onResize() {
    close();
  }

  trigger.addEventListener("click", () => (popup ? close(true) : open()));
  updateText();

  return {
    get value() { return input.value; },
    setValue,
    open,
    close
  };
}
