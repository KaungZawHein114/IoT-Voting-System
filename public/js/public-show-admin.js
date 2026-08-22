const verifyDialog = document.querySelector("#admin-verify-dialog");
const verifyForm = document.querySelector("#admin-verify-form");
const verifyErrorEl = verifyForm?.querySelector("[data-verify-error]");

let pendingVerifyCallback = null;

const openVerifyDialog = (onVerified) => {
  if (!verifyDialog) return;
  pendingVerifyCallback = onVerified;
  verifyForm.reset();
  verifyErrorEl?.classList.remove("visible");
  verifyDialog.showModal();
  verifyDialog.querySelector("#verify-email")?.focus();
};

verifyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = verifyForm.querySelector("button[type=submit]");
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Verifying...";
  verifyErrorEl?.classList.remove("visible");

  try {
    const response = await fetch("/api/v1/public-show/verify-admin", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: verifyForm.email.value,
        password: verifyForm.password.value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Verification failed");

    const callback = pendingVerifyCallback;
    pendingVerifyCallback = null;
    verifyDialog.close();
    if (callback) await callback(data.data.token);
  } catch (error) {
    if (verifyErrorEl) {
      verifyErrorEl.textContent = error.message;
      verifyErrorEl.classList.add("visible");
    }
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
});

/* ---------- Results: unlock once per browser session ---------- */

const RESULTS_TOKEN_KEY = "publicShowResultsToken";
const resultsLocked = document.querySelector("[data-results-locked]");
const resultsBars = document.querySelector("[data-results-bars]");
const resultsTotal = document.querySelector("[data-results-total]");

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

const renderResults = (results, totalVotes) => {
  if (resultsTotal) {
    resultsTotal.textContent = `${totalVotes} total vote${totalVotes === 1 ? "" : "s"}`;
    resultsTotal.hidden = false;
  }

  if (!resultsBars) return;
  if (!results.length) {
    resultsBars.innerHTML =
      '<div class="empty-state"><img src="/icons/bar-chart-3.svg" alt="" /><div>No groups to show results for yet.</div></div>';
    return;
  }

  resultsBars.innerHTML = results
    .map((group, index) => {
      const pct = totalVotes ? Math.round((group.voteCount / totalVotes) * 100) : 0;
      const rank =
        index === 0 && group.voteCount > 0
          ? '<img src="/icons/crown.svg" alt="Leading" />'
          : String(index + 1);
      return `
        <div class="result-bar-row">
          <span class="result-rank">${rank}</span>
          <div class="result-bar-body">
            <div class="result-bar-heading"><strong>Group ${group.groupNumber} · ${escapeHtml(group.title)}</strong><span>${group.voteCount} vote${group.voteCount === 1 ? "" : "s"}</span></div>
            <div class="result-bar-track"><span class="result-bar-fill" style="width:${pct}%"></span></div>
          </div>
        </div>`;
    })
    .join("");
};

const showResultsLocked = () => {
  if (resultsLocked) resultsLocked.hidden = false;
  if (resultsBars) resultsBars.hidden = true;
  if (resultsTotal) resultsTotal.hidden = true;
};

const showResultsUnlocked = () => {
  if (resultsLocked) resultsLocked.hidden = true;
  if (resultsBars) resultsBars.hidden = false;
};

const fetchResults = async (token) => {
  try {
    const response = await fetch("/api/v1/public-show/results", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-Admin-Action": token },
    });
    if (!response.ok) {
      sessionStorage.removeItem(RESULTS_TOKEN_KEY);
      showResultsLocked();
      return;
    }
    const data = await response.json();
    renderResults(data.data.results, data.data.totalVotes);
    showResultsUnlocked();
  } catch (error) {
    showResultsLocked();
  }
};

document.querySelector("[data-unlock-results]")?.addEventListener("click", () => {
  openVerifyDialog(async (token) => {
    sessionStorage.setItem(RESULTS_TOKEN_KEY, token);
    await fetchResults(token);
  });
});

const cachedResultsToken = sessionStorage.getItem(RESULTS_TOKEN_KEY);
if (cachedResultsToken) fetchResults(cachedResultsToken);

/* ---------- Close voting: re-verify every time ---------- */

document.querySelector("[data-close-voting-gated]")?.addEventListener("click", () => {
  openVerifyDialog(async (token) => {
    try {
      const response = await fetch("/api/v1/public-show/close", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Action": token,
        },
        body: "{}",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not close voting");
      window.location.reload();
    } catch (error) {
      window.alert(error.message);
    }
  });
});
