export class UIManager {
    constructor() {
        this.globalToggleBtn = document.getElementById('globalToggleBtn');
        this.socketSelect = document.getElementById('socketSelect');
        this.chkOut = document.getElementById('chkOut');
        this.chkIn = document.getElementById('chkIn');
        this.payloadArea = document.getElementById('payloadArea');
        this.sendBtn = document.getElementById('sendBtn');
        this.queueLabel = document.getElementById('queueLabel');
        this.qForwardBtn = document.getElementById('qForwardBtn');
        this.qDropBtn = document.getElementById('qDropBtn');
        this.logContainer = document.getElementById('log');
        this.clearPayloadBtn = document.getElementById('clearPayloadBtn');
        this.logSearchInput = document.getElementById('logSearchInput');
        this.clearSearchBtn = document.getElementById('clearSearchBtn');
        this.renderedLogsCount = 0;
        this.currentSocketId = "";
    }

    scrollToBottom() {
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    setGlobalAppState(isEnabled) {
        if (!this.globalToggleBtn) return;

        const clearLogsBtn = document.getElementById('clearLogsBtn');
        const logsHeader = Array.from(document.querySelectorAll('h3, div, span')).find(el => el.textContent.includes('Logs'));
        const queueBar = document.querySelector('.queue-bar');
        const actionRow = document.querySelector('.action-row');
        const interceptPanelRow = document.querySelector('.intercept-panel-row');

        if (isEnabled) {
            this.globalToggleBtn.textContent = "Application status: Enabled";
            this.globalToggleBtn.classList.remove('btn-disabled');
            this.globalToggleBtn.classList.add('btn-enabled');
            this.socketSelect.disabled = false;

            if (clearLogsBtn) clearLogsBtn.disabled = false;
            if (logsHeader) logsHeader.style.opacity = "1";
            if (this.logContainer) this.logContainer.style.opacity = "1";
            if (queueBar) queueBar.style.opacity = "1";
            if (actionRow) actionRow.style.opacity = "1";
            if (interceptPanelRow) interceptPanelRow.style.opacity = "1";
        } else {
            this.globalToggleBtn.textContent = "Application status: Disabled";
            this.globalToggleBtn.classList.remove('btn-enabled');
            this.globalToggleBtn.classList.add('btn-disabled');

            this.socketSelect.innerHTML = '<option value="">--- Choose a socket ---</option>';
            this.logContainer.innerHTML = '';
            this.renderedLogsCount = 0;
            this.currentSocketId = "";

            this.socketSelect.disabled = true;
            this.chkOut.disabled = true;
            this.chkIn.disabled = true;
            this.chkOut.checked = false;
            this.chkIn.checked = false;
            this.payloadArea.disabled = true;
            this.sendBtn.disabled = true;
            this.qForwardBtn.disabled = true;
            this.qDropBtn.disabled = true;

            if (this.logSearchInput) {
                this.logSearchInput.disabled = true;
                this.logSearchInput.value = "";
            }
            if (this.clearSearchBtn) {
                this.clearSearchBtn.style.display = "none";
            }
            if (clearLogsBtn) clearLogsBtn.disabled = true;
            if (logsHeader) logsHeader.style.opacity = "0.6";
            if (this.logContainer) this.logContainer.style.opacity = "0.6";
            if (queueBar) queueBar.style.opacity = "0.6";
            if (actionRow) actionRow.style.opacity = "0.6";
            if (interceptPanelRow) interceptPanelRow.style.opacity = "0.6";

            Object.assign(this.sendBtn.style, { cursor: "not-allowed" });
            Object.assign(this.qForwardBtn.style, { cursor: "not-allowed", opacity: "0.6" });
            Object.assign(this.qDropBtn.style, { cursor: "not-allowed", opacity: "0.6" });
        }
    }

    validateSendButton(queueLength) {
        const hasText = this.payloadArea.value.trim().length > 0;
        const isQueueEmpty = queueLength === 0;
        this.clearPayloadBtn.style.display = this.payloadArea.value.length > 0 ? 'flex' : 'none';
        const isSendActive = hasText && isQueueEmpty;
        this.sendBtn.disabled = !isSendActive;

        if (hasText && isQueueEmpty) {
            this.payloadArea.classList.add('tx-send');
            this.payloadArea.classList.remove('tx-recv');
        } else if (isQueueEmpty) {
            this.payloadArea.classList.remove('tx-send', 'tx-recv');
        }

        if (isSendActive) {
            Object.assign(this.sendBtn.style, {
                background: "#2a52be", color: "white", cursor: "pointer", opacity: "1", border: "1px solid #3b66de"
            });
        } else {
            this.sendBtn.style.background = "";
            this.sendBtn.style.color = "";
            this.sendBtn.style.border = "";
            this.sendBtn.style.cursor = "";
        }
    }

    rebuildSocketSelector(sockets) {
        const previousSelected = this.socketSelect.value;
        const existingValues = new Set(Array.from(this.socketSelect.options).map(opt => opt.value));
        const currentSocketIds = Object.keys(sockets);

        for (let i = this.socketSelect.options.length - 1; i >= 0; i--) {
            if (this.socketSelect.options[i].value !== "" && !currentSocketIds.includes(this.socketSelect.options[i].value)) {
                this.socketSelect.remove(i);
            }
        }

        Object.entries(sockets).sort((a, b) => a[1].openedAt - b[1].openedAt).forEach(([id, data], index) => {
            const urlMatch = data.url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
            const text = `#${index + 1} ${urlMatch ? urlMatch[0] : id}`;

            if (!existingValues.has(id)) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = text;
                this.socketSelect.appendChild(opt);
            } else {
                const opt = Array.from(this.socketSelect.options).find(o => o.value === id);
                if (opt) opt.textContent = text;
            }
        });

        if (currentSocketIds.includes(previousSelected)) {
            this.socketSelect.value = previousSelected;
        } else if (currentSocketIds.length > 0) {
            this.socketSelect.value = currentSocketIds[currentSocketIds.length - 1];
        } else {
            this.socketSelect.value = "";
        }
    }

    applySearchHighlight() {
        if (!this.logSearchInput || !this.logContainer) return;

        const query = this.logSearchInput.value.toLowerCase().trim();

        if (this.clearSearchBtn) {
            this.clearSearchBtn.style.display = this.logSearchInput.value.length > 0 ? 'flex' : 'none';
        }

        const items = this.logContainer.querySelectorAll('.log-item');

        items.forEach(item => {
            if (!query) {
                item.classList.remove('search-match');
                return;
            }

            const text = item.textContent.toLowerCase();
            if (text.includes(query)) {
                item.classList.add('search-match');
            } else {
                item.classList.remove('search-match');
            }
        });
    }

    renderLogs(logs) {
        const selectedSocketId = this.socketSelect.value;

        if (this.currentSocketId !== selectedSocketId || logs.length < this.renderedLogsCount) {
            this.logContainer.innerHTML = '';
            this.renderedLogsCount = 0;
            this.currentSocketId = selectedSocketId;
        }

        if (!selectedSocketId) {
            if (this.logSearchInput) this.logSearchInput.disabled = true;
            if (this.clearSearchBtn) this.clearSearchBtn.style.display = "none";
            return;
        }

        const newLogs = logs.slice(this.renderedLogsCount);
        if (newLogs.length === 0) {
            if (this.logSearchInput) {
                this.logSearchInput.disabled = this.logContainer.children.length === 0 || this.socketSelect.disabled;
            }
            return;
        }

        const fragment = document.createDocumentFragment();

        newLogs.forEach(msg => {
            const itemContainer = document.createElement('div');
            itemContainer.className = 'log-item';

            const textSpan = document.createElement('span');
            textSpan.className = msg.event || 'system';

            const logDate = msg.timestamp ? new Date(msg.timestamp) : new Date();
            const formattedTime = `${logDate.toLocaleTimeString('uk-UA', { hour12: false })}.${String(logDate.getMilliseconds()).padStart(3, '0')}`;

            if (msg.event === 'open') {
                textSpan.textContent = `[${formattedTime}] [OPEN] Connection Established -> ${msg.url}`;
            } else if (msg.event === 'close') {
                textSpan.textContent = `[${formattedTime}] [CLOSE] Connection Disconnected`;
            } else if (msg.event === 'intercept') {
                textSpan.textContent = `[${formattedTime}] [INTERCEPTED_${msg.direction}] ${msg.data}`;
                textSpan.className = msg.direction === 'IN' ? 'intercept_in' : 'intercept_out';
            } else {
                textSpan.textContent = `[${formattedTime}] [${msg.event.toUpperCase()}] ${msg.data}`;
            }

            itemContainer.appendChild(textSpan);
            fragment.appendChild(itemContainer);

            requestAnimationFrame(() => {
                if (textSpan.scrollHeight > textSpan.clientHeight + 2) {
                    const expandBtn = document.createElement('span');
                    expandBtn.className = 'expand-btn';
                    expandBtn.textContent = '[more]';

                    expandBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (textSpan.classList.contains('expanded')) {
                            textSpan.classList.remove('expanded');
                            expandBtn.textContent = '[more]';
                        } else {
                            textSpan.classList.add('expanded');
                            expandBtn.textContent = '[less]';
                        }
                    });
                    itemContainer.appendChild(expandBtn);
                } else {
                    textSpan.classList.add('not-truncated');
                }
            });
        });

        this.logContainer.appendChild(fragment);
        this.renderedLogsCount = logs.length;

        while (this.logContainer.children.length > 500) {
            this.logContainer.removeChild(this.logContainer.firstChild);
        }

        if (this.logSearchInput) {
            const isLogEmpty = this.logContainer.children.length === 0;
            this.logSearchInput.disabled = isLogEmpty || this.socketSelect.disabled;
        }

        this.applySearchHighlight();
        this.scrollToBottom();
    }
}