const display = document.querySelector("[data-qr-display]");

if (display) {
  const image = display.querySelector("[data-qr-image]");
  const loading = display.querySelector("[data-qr-loading]");
  const state = display.querySelector("[data-qr-state]");
  const message = display.querySelector("[data-qr-message]");
  const progress = display.querySelector("[data-qr-progress]");
  const scannedCount = display.querySelector("[data-scanned-count]");
  const votedCount = display.querySelector("[data-voted-count]");
  const closeButton = display.querySelector("[data-close-voting]");

  let currentTokenId;
  let expiresAt = 0;
  let timer;
  let creatingToken = false;
  let lastShownAt = 0;
  // Hard floor: whatever triggers a refresh, the visible QR can never be
  // replaced faster than this — the actual fix for "flashing too fast to shoot".
  const MIN_DISPLAY_MS = 4000;

  const responseData = async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "QR code unavailable");
    return data.data;
  };

  const updateStats = (stats = {}) => {
    scannedCount.textContent = stats.scannedCount ?? scannedCount.textContent;
    votedCount.textContent = stats.votedCount ?? votedCount.textContent;
  };

  const schedule = (callback, delay) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(callback, delay);
  };

  const showUnavailable = (text) => {
    currentTokenId = undefined;
    image.removeAttribute("src");
    image.classList.remove("visible");
    loading.hidden = false;
    loading.textContent = text;
    state.textContent = "Voting unavailable";
    message.textContent = "Open voting from the Public IoT Show control page.";
    progress.style.width = "0%";
  };

  const createToken = async () => {
    if (creatingToken || document.hidden) return;

    // Never swap the visible QR faster than MIN_DISPLAY_MS, no matter what
    // triggered this call — refuses to "flash" even if something upstream
    // is asking for a refresh too often.
    if (lastShownAt) {
      const sinceLastShown = Date.now() - lastShownAt;
      if (sinceLastShown < MIN_DISPLAY_MS) {
        return schedule(createToken, MIN_DISPLAY_MS - sinceLastShown);
      }
    }

    creatingToken = true;
    loading.hidden = false;
    loading.textContent = "Preparing secure QR code...";
    image.classList.remove("visible");

    try {
      const data = await responseData(
        await fetch("/api/v1/public-show/qr-token", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      );
      currentTokenId = data.publicId;
      expiresAt = new Date(data.expiresAt).getTime();
      lastShownAt = Date.now();
      image.src = data.qrImage;
      image.classList.add("visible");
      loading.hidden = true;
      state.textContent = "Voting open";
      message.textContent =
        "Scan the current code to receive one voting session.";
      updateStats(data.stats);
      schedule(pollToken, 250);
    } catch (error) {
      showUnavailable(error.message);
      schedule(createToken, 2000);
    } finally {
      creatingToken = false;
    }
  };

  const pollToken = async () => {
    if (!currentTokenId || document.hidden) return;
    // Progress bar only — the rotation decision below never trusts the
    // client's own clock, only the server's claimed/expired verdict.
    const remaining = Math.max(expiresAt - Date.now(), 0);
    progress.style.width = `${Math.min((remaining / 30000) * 100, 100)}%`;

    try {
      const data = await responseData(
        await fetch(
          `/api/v1/public-show/qr-token/${currentTokenId}/status`,
          { credentials: "same-origin", cache: "no-store" },
        ),
      );
      updateStats(data.stats);
      if (!data.open) {
        showUnavailable("Voting is not open");
        return schedule(createToken, 2000);
      }
      if (data.claimed || data.expired) {
        currentTokenId = undefined;
        return createToken();
      }
      schedule(pollToken, 250);
    } catch (error) {
      message.textContent = error.message;
      schedule(pollToken, 1000);
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    // Resume the existing token instead of discarding a still-valid QR every
    // time the tab regains focus (e.g. switching away to take a screenshot).
    if (currentTokenId) {
      pollToken();
    } else {
      createToken();
    }
  });

  const verifyDialog = document.querySelector("#admin-verify-dialog");
  const verifyForm = document.querySelector("#admin-verify-form");
  const verifyErrorEl = verifyForm?.querySelector("[data-verify-error]");

  const openVerifyDialog = () => {
    if (!verifyDialog) return;
    verifyForm.reset();
    if (verifyErrorEl) verifyErrorEl.hidden = true;
    verifyDialog.showModal();
    verifyDialog.querySelector("#verify-email")?.focus();
  };

  verifyDialog?.querySelectorAll("[data-verify-cancel]").forEach((button) => {
    button.addEventListener("click", () => verifyDialog.close());
  });
  verifyDialog?.addEventListener("click", (event) => {
    if (event.target === verifyDialog) verifyDialog.close();
  });

  verifyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = verifyForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    if (verifyErrorEl) verifyErrorEl.hidden = true;

    try {
      const verifyRes = await fetch("/api/v1/public-show/verify-admin", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: verifyForm.email.value,
          password: verifyForm.password.value,
        }),
      });
      const verifyBody = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        throw new Error(verifyBody.message || "Verification failed");
      }

      const closeRes = await fetch("/api/v1/public-show/close", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Action": verifyBody.data.token,
        },
        body: "{}",
      });
      if (!closeRes.ok) {
        const closeBody = await closeRes.json().catch(() => ({}));
        throw new Error(closeBody.message || "Could not close voting");
      }

      verifyDialog.close();
      window.location.assign("/admin/public-show");
    } catch (error) {
      if (verifyErrorEl) {
        verifyErrorEl.textContent = error.message;
        verifyErrorEl.hidden = false;
      }
    } finally {
      submitButton.disabled = false;
    }
  });

  closeButton?.addEventListener("click", () => openVerifyDialog());

  createToken();
}
