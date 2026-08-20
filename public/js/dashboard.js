const toast = document.querySelector("#app-toast");

const showToast = (message, type = "success") => {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast visible ${type === "error" ? "error" : ""}`;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 3600);
};

const responseMessage = async (response) => {
  if (response.status === 204) return {};
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "The request could not be completed");
  return data;
};

const apiRequest = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
  });
  return responseMessage(response);
};

const confirmationDialog = document.querySelector("#confirmation-dialog");

const requestConfirmation = ({ message, title, confirmLabel, danger = false }) => {
  if (!confirmationDialog) return Promise.resolve(false);

  confirmationDialog.returnValue = "";
  confirmationDialog.querySelector("#confirmation-dialog-title").textContent = title;
  confirmationDialog.querySelector("#confirmation-dialog-message").textContent = message;

  const acceptButton = confirmationDialog.querySelector("[data-confirm-accept]");
  acceptButton.textContent = confirmLabel;
  acceptButton.className = `button ${danger ? "danger" : "primary"}`;

  return new Promise((resolve) => {
    const listeners = new AbortController();
    let settled = false;

    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      listeners.abort();
      if (confirmationDialog.open) confirmationDialog.close();
      resolve(accepted);
    };

    const accept = () => finish(true);
    const cancel = () => finish(false);
    const dismissWithKeyboard = (event) => {
      event.preventDefault();
      finish(false);
    };

    acceptButton.addEventListener("click", accept, { signal: listeners.signal });
    confirmationDialog.querySelectorAll("[data-confirm-cancel]").forEach((button) => {
      button.addEventListener("click", cancel, { signal: listeners.signal });
    });
    confirmationDialog.addEventListener("cancel", dismissWithKeyboard, { signal: listeners.signal });
    confirmationDialog.addEventListener("close", cancel, { signal: listeners.signal });
    confirmationDialog.showModal();
  });
};

const setButtonBusy = (button, busy) => {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = "Working...";
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
};

document.querySelector("[data-sidebar-open]")?.addEventListener("click", () => {
  document.body.classList.add("sidebar-open");
});

document.querySelectorAll("[data-sidebar-close]").forEach((button) => {
  button.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
});

document.querySelector("[data-logout]")?.addEventListener("click", async () => {
  try {
    await apiRequest("/api/v1/auth/logout", { method: "POST" });
    window.location.assign("/login");
  } catch (error) {
    showToast(error.message, "error");
  }
});

document.querySelectorAll("[data-open-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(`#${button.dataset.openDialog}`)?.showModal();
  });
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog")?.close());
});

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

const activateTab = (button, updateUrl = true) => {
  const container = button.closest("[data-tabs]");
  if (!container) return;

  container.querySelectorAll("[data-tab-target]").forEach((item) => item.classList.remove("active"));
  container.parentElement.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== button.dataset.tabTarget;
  });
  button.classList.add("active");

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.hash = button.dataset.tabTarget;
    window.history.replaceState(null, "", url.toString());
  }
};

document.querySelectorAll("[data-tab-target]").forEach((button) => {
  button.addEventListener("click", () => activateTab(button));
});

const requestedTab = window.location.hash.slice(1);
const requestedTabButton = Array.from(document.querySelectorAll("[data-tab-target]")).find(
  (button) => button.dataset.tabTarget === requestedTab,
);
if (requestedTabButton) activateTab(requestedTabButton, false);

document.querySelectorAll("[data-table-search]").forEach((input) => {
  input.addEventListener("input", () => {
    const table = document.querySelector(`#${input.dataset.tableSearch}`);
    const query = input.value.trim().toLowerCase();
    table?.querySelectorAll("tbody tr[data-search-row]").forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(query);
    });
  });
});

const formJson = (form) => {
  const body = {};
  new FormData(form).forEach((value, key) => {
    if (!(value instanceof File)) body[key] = value;
  });
  return body;
};

const groupFormData = (form) => {
  const data = new FormData(form);
  const members = String(data.get("members") || "")
    .split(/\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
  data.set("members", JSON.stringify(members));
  return data;
};

const projectFormJson = (form) => {
  const data = new FormData(form);
  const body = {};
  ["batch", "projectStartDate", "projectManager", "theme"].forEach((field) => {
    if (data.has(field)) body[field] = data.get(field);
  });

  if (form.dataset.projectSection === "show") {
    body.projectShow = {
      startDate: data.get("showStartDate") || null,
      startTime: data.get("showStartTime") || null,
      endTime: data.get("showEndTime") || null,
      location: {
        campus: data.get("campus") || null,
        floor: data.get("floor") || null,
        room: data.get("room") || null,
      },
      votingCategories: Array.from(form.querySelectorAll(".category-row"))
        .map((row) => ({
          ...(row.querySelector("[name=categoryId]")?.value
            ? { _id: row.querySelector("[name=categoryId]").value }
            : {}),
          name: row.querySelector("[name=categoryName]").value.trim(),
          description: row.querySelector("[name=categoryDescription]").value.trim(),
        }))
        .filter((category) => category.name && category.description),
    };
  }
  return body;
};

document.querySelectorAll("form[data-api-form]").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    if (form.dataset.confirm) {
      const buttonLabel = button?.textContent.trim() || "Confirm";
      const confirmed = await requestConfirmation({
        message: form.dataset.confirm,
        title: form.dataset.confirmTitle || `Confirm ${buttonLabel.toLowerCase()}`,
        confirmLabel: buttonLabel,
        danger: button?.classList.contains("danger"),
      });
      if (!confirmed) return;
    }
    setButtonBusy(button, true);

    try {
      let body;
      let headers;
      if (form.hasAttribute("data-group-form")) {
        body = groupFormData(form);
      } else if (form.hasAttribute("data-project-form")) {
        body = JSON.stringify(projectFormJson(form));
        headers = { "Content-Type": "application/json" };
      } else {
        body = JSON.stringify(formJson(form));
        headers = { "Content-Type": "application/json" };
      }

      await apiRequest(form.dataset.endpoint, {
        method: form.dataset.method || "POST",
        headers,
        body,
      });

      showToast(form.dataset.success || "Saved successfully");
      const redirect = form.dataset.redirect;
      window.setTimeout(() => {
        if (redirect && redirect !== "reload") window.location.assign(redirect);
        else window.location.reload();
      }, 350);
    } catch (error) {
      showToast(error.message, "error");
      setButtonBusy(button, false);
    }
  });
});

document.querySelectorAll("[data-delete-endpoint]").forEach((button) => {
  button.addEventListener("click", async () => {
    const confirmed = await requestConfirmation({
      message: button.dataset.confirm || "Delete this item?",
      title: button.dataset.confirmTitle || "Confirm deletion",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) return;
    setButtonBusy(button, true);
    try {
      await apiRequest(button.dataset.deleteEndpoint, { method: "DELETE" });
      showToast("Deleted successfully");
      window.setTimeout(() => window.location.assign(button.dataset.redirect), 350);
    } catch (error) {
      showToast(error.message, "error");
      setButtonBusy(button, false);
    }
  });
});

document.querySelector("[data-add-category]")?.addEventListener("click", () => {
  const list = document.querySelector("#category-list");
  const row = document.createElement("div");
  row.className = "category-row";
  row.innerHTML = `
    <input name="categoryName" placeholder="Category name" required />
    <input class="category-description" name="categoryDescription" placeholder="Short description" required />
    <button class="icon-button" type="button" data-remove-category title="Remove category">
      <img src="/icons/x.svg" alt="Remove category" />
    </button>`;
  list.appendChild(row);
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-category]");
  if (button) button.closest(".category-row")?.remove();
});

document.querySelector("form[data-login-form]")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = form.querySelector(".login-message");
  const button = form.querySelector("button[type=submit]");
  message.classList.remove("visible");
  setButtonBusy(button, true);

  try {
    const data = await apiRequest("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formJson(form)),
    });
    window.location.assign(data.data.user.role === "ADMIN" ? "/admin" : "/manager");
  } catch (error) {
    message.textContent = error.message;
    message.classList.add("visible");
    setButtonBusy(button, false);
  }
});
