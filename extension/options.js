const baseUrlEl = document.getElementById("baseUrl");

const tokenEl = document.getElementById("token");

const saveBtn = document.getElementById("save");

const testBtn = document.getElementById("test");

const statusEl = document.getElementById("status");

const DEFAULT_URL = "http://127.0.0.1:58491";

chrome.storage.sync.get({ baseUrl: DEFAULT_URL, token: "" }, (cfg) => {
  baseUrlEl.value = cfg.baseUrl;

  tokenEl.value = cfg.token;

});

function status(msg, ok) {
  statusEl.textContent = msg;

  statusEl.style.color = ok ? "#86efac" : "#fca5a5";

}

saveBtn?.addEventListener("click", () => {
  const baseUrl = (baseUrlEl.value || "").trim() || DEFAULT_URL;

  const token = (tokenEl.value || "").trim();

  chrome.storage.sync.set({ baseUrl, token }, () => status("Saved.", true));

});

testBtn?.addEventListener("click", () => {
  const baseUrl = (baseUrlEl.value || "").trim() || DEFAULT_URL;

  status("Testing…", true);

  chrome.runtime.sendMessage(
    { type: "MYVAULT_HEALTH_CHECK", baseUrl },
    (res) => {
      if (chrome.runtime.lastError) {
        status(`Failed: ${chrome.runtime.lastError.message}`, false);
        return;
      }

      if (!res || res.ok === undefined) {
        status("Failed: No response from extension background.", false);
        return;
      }

      if (res.ok) {
        status(
          `Health: ok (${res.locked ? "vault locked — unlock in Myvault to use APIs" : "vault unlocked · ready"})`,
          true
        );
      } else {
        status(`Failed: ${res.error || "Unknown error"}`, false);
      }
    }
  );
});
