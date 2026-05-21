import { ExtAPI } from '../api/api.js';
import { StateManager } from './state.js';
import { UIManager } from '../ui/ui.js';

const state = new StateManager();
const ui = new UIManager();

chrome.runtime.connect({ name: "side-panel-channel" });

let isAppEnabled = false;

chrome.runtime.sendMessage({ type: "GET_GLOBAL_APP_STATE" }, (response) => {
  isAppEnabled = response ? response.isEnabled : false;
  ui.setGlobalAppState(isAppEnabled);
  if (isAppEnabled) {
    bootstrapApp();
  }
});

function bootstrapApp() {
  state.fetchState(ui.socketSelect.value, (globalState) => {
    ui.rebuildSocketSelector(globalState.sockets);
    syncControlsWithSocket();
    ui.renderLogs(state.getFilteredLogs(ui.socketSelect.value));
    updateQueueUI(globalState.queue);
  });
}

function scheduleUiUpdate() {
  if (!isAppEnabled) return;
  if (state.isUpdatePending) return;
  state.isUpdatePending = true;

  requestAnimationFrame(() => {
    state.fetchState(ui.socketSelect.value, (globalState) => {
      ui.rebuildSocketSelector(globalState.sockets);
      if (ui.socketSelect.value) {
        syncControlsWithSocket();
      }
      updateQueueUI(globalState.queue);
      ui.renderLogs(state.getFilteredLogs(ui.socketSelect.value));
      state.isUpdatePending = false;
    });
  });
}

function updateQueueUI(queue) {
  if (!isAppEnabled) return;
  const currentSocketId = ui.socketSelect.value;
  state.internalQueue = (queue || []).filter(q => q.socketId === currentSocketId);
  ui.queueLabel.textContent = `messages in queue: ${state.internalQueue.length}`;

  const hasElements = state.internalQueue.length > 0;
  ui.qForwardBtn.disabled = !hasElements;
  ui.qDropBtn.disabled = !hasElements;

  Object.assign(ui.qForwardBtn.style, hasElements ? { cursor: "pointer", opacity: "1" } : { cursor: "not-allowed", opacity: "0.5" });
  Object.assign(ui.qDropBtn.style, hasElements ? { cursor: "pointer", opacity: "1" } : { cursor: "not-allowed", opacity: "0.5" });

  if (hasElements) {
    const firstMsg = state.internalQueue[0];
    ui.payloadArea.value = firstMsg.data;
    ui.payloadArea.className = firstMsg.direction === "OUT" ? 'tx-send' : 'tx-recv';
  } else if (document.activeElement !== ui.payloadArea && currentSocketId) {
    ExtAPI.getState((res) => {
      if (res?.sockets[currentSocketId]) {
        ui.payloadArea.value = res.sockets[currentSocketId].draftPayload || "";
        if (!ui.payloadArea.value) ui.payloadArea.className = '';
        ui.validateSendButton(0);
      }
    });
  }
  ui.validateSendButton(state.internalQueue.length);
}

function syncControlsWithSocket() {
  if (!isAppEnabled) return;
  const currentSocketId = ui.socketSelect.value;

  if (!currentSocketId) {
    ui.chkOut.checked = false; ui.chkIn.checked = false;
    ui.chkOut.disabled = true; ui.chkIn.disabled = true;
    ui.payloadArea.value = ""; ui.payloadArea.disabled = true;
    ui.validateSendButton(0);
    return;
  }

  ui.chkOut.disabled = false; ui.chkIn.disabled = false;
  ui.payloadArea.disabled = false;

  ExtAPI.getState((globalState) => {
    const socketInfo = globalState?.sockets[currentSocketId];
    if (!socketInfo) return;

    ui.chkOut.checked = socketInfo.interceptConfig.out;
    ui.chkIn.checked = socketInfo.interceptConfig.in;

    if (state.internalQueue.length === 0) {
      ui.payloadArea.value = socketInfo.draftPayload || "";
    }
    ui.validateSendButton(state.internalQueue.length);
  });
}

function validateInterceptLock() {
  if (!isAppEnabled) return;
  const currentSocketId = ui.socketSelect.value;
  if (!currentSocketId) return;

  const anyChecked = ui.chkOut.checked || ui.chkIn.checked;

  ExtAPI.getState((globalState) => {
    const prevConfig = globalState?.sockets[currentSocketId]?.interceptConfig;
    if (!prevConfig) return;

    if (state.internalQueue.length > 0) {
      if (prevConfig.out && !ui.chkOut.checked) {
        state.internalQueue.filter(m => m.direction === "OUT" && m.socketId === currentSocketId)
            .forEach(m => ExtAPI.popQueueElement(m.id, "FORWARD", m.data));
      }
      if (prevConfig.in && !ui.chkIn.checked) {
        state.internalQueue.filter(m => m.direction === "IN" && m.socketId === currentSocketId)
            .forEach(m => ExtAPI.popQueueElement(m.id, "FORWARD", m.data));
      }
    }

    ExtAPI.setInterceptConfig(currentSocketId, {
      enabled: anyChecked,
      out: ui.chkOut.checked,
      in: ui.chkIn.checked
    }, () => {
      scheduleUiUpdate();
    });
  });
}

function clearSocketDraft(socketId) {
  ui.payloadArea.value = "";
  ui.payloadArea.className = '';
  ExtAPI.updateSocketDraft(socketId, "");
}

if (ui.globalToggleBtn) {
  ui.globalToggleBtn.addEventListener('click', () => {
    const nextState = !isAppEnabled;
    chrome.runtime.sendMessage({ type: "SET_GLOBAL_APP_STATE", isEnabled: nextState }, (res) => {
      if (res?.success) {
        isAppEnabled = nextState;
        ui.setGlobalAppState(isAppEnabled);
        if (isAppEnabled) {
          bootstrapApp();
        }
      }
    });
  });
}

if (ui.logSearchInput) {
  ui.logSearchInput.addEventListener('input', () => {
    ui.applySearchHighlight();
  });
}

if (ui.clearSearchBtn) {
  ui.clearSearchBtn.addEventListener('click', () => {
    if (ui.logSearchInput) {
      ui.logSearchInput.value = "";
      ui.applySearchHighlight();
      ui.logSearchInput.focus();
    }
  });
}

ui.payloadArea.addEventListener('input', () => {
  if (!isAppEnabled) return;
  ui.validateSendButton(state.internalQueue.length);
  const currentSocketId = ui.socketSelect.value;
  if (currentSocketId && state.internalQueue.length === 0) {
    ExtAPI.updateSocketDraft(currentSocketId, ui.payloadArea.value);
  }
});

ui.chkOut.addEventListener('change', validateInterceptLock);
ui.chkIn.addEventListener('change', validateInterceptLock);

ui.socketSelect.addEventListener('change', () => {
  if (!isAppEnabled) return;
  syncControlsWithSocket();
  ui.renderLogs(state.getFilteredLogs(ui.socketSelect.value));
  ExtAPI.getState((res) => res && updateQueueUI(res.queue));
});

ui.sendBtn.addEventListener('click', () => {
  if (!isAppEnabled) return;
  const socketId = ui.socketSelect.value;
  if (!socketId) return;
  ExtAPI.sendDirectMessage(socketId, ui.payloadArea.value);
  clearSocketDraft(socketId);
  ui.validateSendButton(0);
});

ui.clearPayloadBtn.addEventListener('click', () => {
  if (!isAppEnabled) return;
  const currentSocketId = ui.socketSelect.value;
  if (currentSocketId) clearSocketDraft(currentSocketId);
  else {
    ui.payloadArea.value = "";
    ui.payloadArea.className = '';
  }
  ui.validateSendButton(state.internalQueue.length);
  ui.payloadArea.focus();
});

ui.qForwardBtn.addEventListener('click', () => {
  if (!isAppEnabled || state.internalQueue.length === 0) return;
  const currentSocketId = ui.socketSelect.value;
  ExtAPI.popQueueElement(state.internalQueue[0].id, "FORWARD", ui.payloadArea.value, (res) => {
    if (res?.success) {
      clearSocketDraft(currentSocketId);
      scheduleUiUpdate();
    }
  });
});

ui.qDropBtn.addEventListener('click', () => {
  if (!isAppEnabled || state.internalQueue.length === 0) return;
  const currentSocketId = ui.socketSelect.value;
  ExtAPI.popQueueElement(state.internalQueue[0].id, "DROP", null, (res) => {
    if (res?.success) {
      clearSocketDraft(currentSocketId);
      scheduleUiUpdate();
    }
  });
});

document.getElementById('clearLogsBtn').addEventListener('click', () => {
  if (!isAppEnabled) return;
  const currentSocketId = ui.socketSelect.value;
  if (!currentSocketId) return;
  ExtAPI.clearLogs(currentSocketId, () => {
    state.globalLogsCache = state.globalLogsCache.filter(log => log.socketId !== currentSocketId);
    ui.renderLogs([]);
    if (ui.logSearchInput) ui.logSearchInput.value = "";
    if (ui.clearSearchBtn) ui.clearSearchBtn.style.display = "none";
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "GLOBAL_STATE_CHANGED") {
    isAppEnabled = message.isEnabled;
    ui.setGlobalAppState(isAppEnabled);
    if (isAppEnabled) {
      bootstrapApp();
    }
  }
  if (message.type === "UI_UPDATE") {
    if (message.data.event !== "intercept") state.pushLog(message.data);
    scheduleUiUpdate();
  }
  if (message.type === "TAB_CLEANUP") {
    if (!isAppEnabled) return;
    state.fetchState(ui.socketSelect.value, (globalState) => {
      ui.rebuildSocketSelector(globalState.sockets);
      ui.renderLogs(state.getFilteredLogs(ui.socketSelect.value));
      updateQueueUI(globalState.queue);
    });
  }
});