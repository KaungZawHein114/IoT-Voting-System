const admissionPage = document.querySelector("[data-admission-page]");

if (admissionPage) {
  const message = admissionPage.querySelector("[data-admission-message]");
  const token = window.location.hash.slice(1);
  window.history.replaceState(null, "", window.location.pathname);

  const admit = async () => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      message.textContent = "This QR code is invalid or has expired.";
      return;
    }

    try {
      const response = await fetch(
        `/api/v1/voting/${encodeURIComponent(admissionPage.dataset.batch)}/admit`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Voting access denied");
      window.location.replace(data.data.redirectUrl);
    } catch (error) {
      message.textContent = error.message;
    }
  };

  admit();
}
