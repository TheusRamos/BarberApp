// ============================================================
// JANELA DE CONFIRMAÇÃO
// Substitui o confirm() do navegador por uma janela no visual do Barber.
// Usa o <dialog> do próprio navegador: o foco fica preso dentro da janela,
// Esc cancela, e o leitor de tela anuncia o título e a pergunta.
//
// Uso: if (!(await confirmDialog("Cancelar este agendamento?", { ... }))) return;
// ============================================================

export function confirmDialog(message, {
  title = "Confirmar",
  confirmText = "Confirmar",
  cancelText = "Voltar",
  danger = false
} = {}) {
  const dialog = document.createElement("dialog");
  // Navegador antigo, sem <dialog>: volta para a confirmação padrão
  if (typeof dialog.showModal !== "function") return Promise.resolve(window.confirm(message));

  return new Promise(resolve => {
    dialog.className = "confirm-dialog";
    dialog.setAttribute("aria-labelledby", "confirm-dialog-title");
    dialog.setAttribute("aria-describedby", "confirm-dialog-text");
    dialog.innerHTML = `
      <div class="confirm-dialog-body">
        <h2 id="confirm-dialog-title"></h2>
        <p id="confirm-dialog-text"></p>
        <div class="confirm-dialog-actions">
          <button type="button" class="dialog-cancel"></button>
          <button type="button" class="dialog-ok${danger ? " danger" : ""}"></button>
        </div>
      </div>`;
    // textContent: o texto nunca é interpretado como HTML
    dialog.querySelector("h2").textContent = title;
    dialog.querySelector("p").textContent = message;
    const cancelButton = dialog.querySelector(".dialog-cancel");
    const okButton = dialog.querySelector(".dialog-ok");
    cancelButton.textContent = cancelText;
    okButton.textContent = confirmText;

    const opener = document.activeElement;
    let answer = false;
    okButton.addEventListener("click", () => {
      answer = true;
      dialog.close();
    });
    cancelButton.addEventListener("click", () => dialog.close());
    // Clique no fundo escurecido (fora da caixa) também cancela
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
    // Fechou de qualquer jeito (botões, Esc, clique fora): devolve a resposta e o foco
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(answer);
      // O foco volta ao botão que abriu a janela no ciclo seguinte: quem chamou costuma
      // reativar o botão (withButton) logo depois da resposta, e botão desativado não recebe foco
      setTimeout(() => {
        if (opener?.isConnected && !opener.disabled && document.activeElement === document.body) opener.focus();
      });
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    // Ações que apagam algo começam com o foco em "Voltar", contra um Enter sem querer
    (danger ? cancelButton : okButton).focus();
  });
}
