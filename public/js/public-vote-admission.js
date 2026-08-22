const admissionPage = document.querySelector("[data-admission-page]");

if (admissionPage) {
  const title = admissionPage.querySelector("[data-admission-title]");
  const message = admissionPage.querySelector("[data-admission-message]");
  const loader = admissionPage.querySelector("[data-admission-loader]");
  const errorMark = admissionPage.querySelector(
    "[data-admission-error-mark]",
  );
  const guidance = admissionPage.querySelector("[data-admission-guidance]");
  const token = window.location.hash.slice(1);
  window.history.replaceState(null, "", window.location.pathname);

  const showError = (heading, detail, showScanGuidance = true) => {
    admissionPage.setAttribute("aria-busy", "false");
    admissionPage.dataset.admissionState = "error";
    title.textContent = heading;
    message.textContent = detail;
    loader.hidden = true;
    errorMark.hidden = false;
    guidance.hidden = !showScanGuidance;
    document.title = `${heading} | GUSTO IoT Show`;
  };

  const admit = async () => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      showError(
        "QR code unavailable",
        "This QR code is incomplete, expired, or no longer active.",
      );
      return;
    }

    try {
      const response = await fetch("/api/v1/public-voting/admit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          showError(
            "QR code no longer available",
            "This one-time QR code has expired or has already been used.",
          );
          return;
        }
        if (response.status === 409) {
          showError(
            "Voting is currently closed",
            "The Public Show is not accepting votes right now.",
            false,
          );
          return;
        }
        if (response.status === 429) {
          showError(
            "Too many scan attempts",
            "Please wait a moment, then scan the current QR code again.",
          );
          return;
        }

        showError(
          "Could not verify this QR code",
          data.message || "Voting access is temporarily unavailable.",
        );
        return;
      }
      window.location.replace(data.data.redirectUrl);
    } catch (error) {
      showError(
        "Connection problem",
        "We could not check this QR code. Check your internet connection, then scan the current code again.",
      );
    }
  };

  admit();
}
