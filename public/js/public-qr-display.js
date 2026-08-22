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

  const QR_TTL_MS = 10000;
  // Never swap the visible QR faster than this, no matter what triggers a
  // refresh attempt.
  const MIN_DISPLAY_MS = 1000;
  const HEARTBEAT_MS = 250;

  let currentTokenId;
  let displayExpiresAt = 0;
  let lastShownAt = 0;
  let requestInFlight = false;
  let unavailableUntil = 0;
  let progressAnimationId;

  const responseData = async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "QR code unavailable");
    return data.data;
  };

  const updateStats = (stats = {}) => {
    scannedCount.textContent = stats.scannedCount ?? scannedCount.textContent;
    votedCount.textContent = stats.votedCount ?? votedCount.textContent;
  };

  const setProgress = (remainingMs) => {
    const progressRatio = Math.max(
      0,
      Math.min(remainingMs / QR_TTL_MS, 1),
    );
    progress.style.transform = `scaleX(${progressRatio})`;
  };

  const stopProgressAnimation = ({ reset = false } = {}) => {
    if (progressAnimationId !== undefined) {
      window.cancelAnimationFrame(progressAnimationId);
      progressAnimationId = undefined;
    }
    if (reset) setProgress(0);
  };

  // Rendering is kept separate from server polling so a slow status request
  // cannot make the countdown jump. Absolute time keeps the bar accurate if
  // the browser pauses animation frames while the tab is in the background.
  const animateProgress = () => {
    if (!currentTokenId) {
      progressAnimationId = undefined;
      return;
    }

    const remaining = Math.max(displayExpiresAt - Date.now(), 0);
    setProgress(remaining);

    if (remaining === 0) {
      currentTokenId = undefined;
      progressAnimationId = undefined;
      return;
    }

    progressAnimationId = window.requestAnimationFrame(animateProgress);
  };

  const startProgressAnimation = () => {
    stopProgressAnimation();
    setProgress(displayExpiresAt - Date.now());
    progressAnimationId = window.requestAnimationFrame(animateProgress);
  };

  const showUnavailable = (text) => {
    currentTokenId = undefined;
    stopProgressAnimation({ reset: true });
    image.removeAttribute("src");
    image.classList.remove("visible");
    loading.hidden = false;
    loading.textContent = text;
    state.textContent = "Voting unavailable";
    message.textContent = "Open voting from the Public IoT Show control page.";
    unavailableUntil = Date.now() + 2000;
  };

  // A single request is ever in flight at a time (createToken or pollToken),
  // and both are driven only by the heartbeat below — nothing else (no
  // visibility events, no chained timers) can trigger a fetch, so the QR
  // can never rotate faster than MIN_DISPLAY_MS regardless of environment
  // quirks (multi-monitor, remote display, screen capture, etc.).
  const createToken = async () => {
    if (requestInFlight) return;
    if (lastShownAt && Date.now() - lastShownAt < MIN_DISPLAY_MS) return;

    requestInFlight = true;
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
      // The display rotates at 10 seconds. The server keeps the underlying
      // link valid for a short grace period after it disappears from screen.
      displayExpiresAt = new Date(data.displayExpiresAt).getTime();
      lastShownAt = Date.now();
      image.src = data.qrImage;
      image.classList.add("visible");
      loading.hidden = true;
      state.textContent = "Voting open";
      message.textContent =
        "Scan the current code to receive one voting session.";
      updateStats(data.stats);
      startProgressAnimation();
    } catch (error) {
      showUnavailable(error.message);
    } finally {
      requestInFlight = false;
    }
  };

  const pollToken = async () => {
    if (requestInFlight || !currentTokenId) return;

    requestInFlight = true;
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
        return;
      }
      if (data.claimed || data.expired) {
        currentTokenId = undefined;
        stopProgressAnimation({ reset: true });
      }
    } catch (error) {
      message.textContent = error.message;
    } finally {
      requestInFlight = false;
    }
  };

  // Single steady heartbeat — deliberately not tied to visibilitychange.
  // Chained setTimeout-plus-"resume on visibility" designs are fragile: any
  // environment that fires visibilitychange more than once per real tab
  // switch (multi-monitor, remote/projector display, screen capture, etc.)
  // ends up re-triggering the resume path repeatedly. A plain interval that
  // just checks current state every tick has no such trigger to misfire.
  const heartbeat = () => {
    if (Date.now() < unavailableUntil) return;
    if (currentTokenId) {
      pollToken();
    } else {
      createToken();
    }
  };

  setInterval(heartbeat, HEARTBEAT_MS);
  heartbeat();

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
}
