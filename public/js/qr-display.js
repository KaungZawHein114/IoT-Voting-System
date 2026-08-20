const display = document.querySelector("[data-qr-display]");

if (display) {
  const projectId = display.dataset.projectId;
  const image = display.querySelector("[data-qr-image]");
  const loading = display.querySelector("[data-qr-loading]");
  const state = display.querySelector("[data-qr-state]");
  const message = display.querySelector("[data-qr-message]");
  const progress = display.querySelector("[data-qr-progress]");
  const scannedCount = display.querySelector("[data-scanned-count]");
  const votedCount = display.querySelector("[data-voted-count]");

  let currentTokenId;
  let expiresAt = 0;
  let timer;
  let creatingToken = false;

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
    message.textContent = "Open voting from the project control panel.";
    progress.style.width = "0%";
  };

  const createToken = async () => {
    if (creatingToken || document.hidden) return;
    creatingToken = true;
    loading.hidden = false;
    loading.textContent = "Preparing secure QR code...";
    image.classList.remove("visible");

    try {
      const data = await responseData(
        await fetch(`/api/v1/projects/${projectId}/qr-token`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      );
      currentTokenId = data.publicId;
      expiresAt = new Date(data.expiresAt).getTime();
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
    const remaining = Math.max(expiresAt - Date.now(), 0);
    progress.style.width = `${Math.min((remaining / 30000) * 100, 100)}%`;

    try {
      const data = await responseData(
        await fetch(
          `/api/v1/projects/${projectId}/qr-token/${currentTokenId}/status`,
          { credentials: "same-origin", cache: "no-store" },
        ),
      );
      updateStats(data.stats);
      if (!data.open) {
        showUnavailable("Voting is not open");
        return schedule(createToken, 2000);
      }
      if (data.claimed || data.expired || remaining === 0) {
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
    if (!document.hidden) createToken();
  });

  createToken();
}
