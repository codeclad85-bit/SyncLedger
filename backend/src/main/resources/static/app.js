"use strict";

const $ = (id) => document.getElementById(id);
const categories = {
    GROCERY: "Grocery / Kirana",
    FOOD: "Food & Beverages",
    CLOTHING: "Clothing",
    ELECTRONICS: "Electronics",
    SERVICES: "Services",
    OTHER: "Other"
};

let db;
let busy = false;
let serverRecords = [];
let serverConflicts = [];
let branchOverview = null;
let serverAvailable = false;
let conflictsAvailable = false;
let branchesAvailable = false;
let branchFilter = "ALL";

let state = {
    records: [],
    events: [],
    devices: { "RANCHI-01": true, "PATNA-01": true },
    selected: null,
    dropAck: false,
    duplicates: 0
};

const clean = (value) => String(value ?? "").trim() || null;
const storeName = (id) => ({
    "RANCHI-01": "Ranchi Store",
    "PATNA-01": "Patna Store"
})[id] || id;

function paise(value) {
    const text = String(value);
    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
        throw new Error("Enter an amount with up to two decimals.");
    }
    const [whole, fraction = ""] = text.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function decimal(value) {
    return (value / 100n).toString() + "." +
        (value % 100n).toString().padStart(2, "0");
}

function moneyPaise(value) {
    return "₹" + new Intl.NumberFormat("en-IN").format(value / 100n) +
        "." + (value % 100n).toString().padStart(2, "0");
}

const money = (value) => moneyPaise(paise(value));

function notice(message, error = false) {
    $("notice").textContent = message;
    $("notice").className = error ? "notice error" : "notice";
}

function element(tag, text, className = "") {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    node.className = className;
    return node;
}

function badge(text, type) {
    return element("span", text, "badge " + type.toLowerCase());
}

function cell(row, value) {
    const td = document.createElement("td");
    if (value instanceof Node) td.append(value);
    else td.textContent = String(value ?? "");
    row.append(td);
    return td;
}

function emptyRow(body, columns, message) {
    const row = document.createElement("tr");
    const td = cell(row, message);
    td.colSpan = columns;
    td.className = "empty-state";
    body.append(row);
}

function openStorage() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("syncledger-local", 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains("state")) {
                request.result.createObjectStore("state");
            }
        };
        request.onsuccess = () => {
            db = request.result;
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

function loadState() {
    return new Promise((resolve, reject) => {
        const request = db.transaction("state", "readonly")
            .objectStore("state").get("main");
        request.onsuccess = () => {
            if (request.result) {
                state = {
                    ...state,
                    ...request.result,
                    devices: {
                        ...state.devices,
                        ...request.result.devices
                    }
                };
            }
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

function saveState() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("state", "readwrite");
        transaction.objectStore("state").put(state, "main");
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(
            transaction.error || new Error("Local save aborted.")
        );
    });
}

function event(status, transactionId, reason) {
    state.events.unshift({
        status,
        transactionId,
        reason,
        time: new Date().toISOString()
    });
}

async function api(path, options = {}) {
    return window.SyncLedgerAuth.api(path, options);
}

async function refreshServer() {
    const results = await Promise.allSettled([
        api("/transactions"),
        api("/conflicts"),
        api("/branches")
    ]);
    serverAvailable = results[0].status === "fulfilled" &&
        Array.isArray(results[0].value);
    conflictsAvailable = results[1].status === "fulfilled" &&
        Array.isArray(results[1].value);
    branchesAvailable = results[2].status === "fulfilled" &&
        Array.isArray(results[2].value?.branches);

    if (serverAvailable) serverRecords = results[0].value;
    if (conflictsAvailable) serverConflicts = results[1].value;
    if (branchesAvailable) branchOverview = results[2].value;

    if (!serverAvailable) {
        notice("Server data unavailable. Local sales are preserved.", true);
    }
    render();
}

function selectedRecord() {
    return state.records.find(
        (record) => record.transactionId === state.selected
    );
}

function sameDetails(a, b) {
    return !!a && !!b &&
        a.transactionId === b.transactionId &&
        a.merchantId === b.merchantId &&
        a.currency === b.currency &&
        paise(a.amount) === paise(b.amount) &&
        Date.parse(a.createdAt) === Date.parse(b.createdAt) &&
        clean(a.category) === clean(b.category) &&
        clean(a.itemName) === clean(b.itemName) &&
        clean(a.note) === clean(b.note);
}

function visibleRecords(records) {
    return branchFilter === "ALL" ? records :
        records.filter((record) => record.merchantId === branchFilter);
}

function chooseBranch(value) {
    branchFilter = value;
    $("branch-filter").value = value;
    if (value !== "ALL") {
        $("merchant-select").value = value;
        $("target-device").value = value;
    }
    const selected = selectedRecord();
    if (selected && value !== "ALL" && selected.merchantId !== value) {
        state.selected = null;
    }
    render();
}

function renderBranches() {
    const container = $("branch-overview");
    container.replaceChildren();
    if (!branchesAvailable) {
        $("owner-group").textContent = "Branch overview unavailable";
        container.append(element(
            "p", "Connect to the server for current branch totals.",
            "empty-state"
        ));
        return;
    }

    $("owner-group").textContent =
        branchOverview.groupName + " · " +
        branchOverview.branches.length + " branches · Confirmed total " +
        money(branchOverview.combinedTotal);

    for (const branch of branchOverview.branches) {
        const card = document.createElement("div");
        const pending = state.records.filter(
            (record) => record.merchantId === branch.branchId &&
                record.status === "PENDING"
        );
        const pendingAmount = pending.reduce(
            (sum, record) => sum + paise(record.amount), 0n
        );
        const online = state.devices[branch.branchId];

        card.append(
            element("h3", branch.name),
            element("p",
                branch.state + " · District: " + branch.district +
                " · City: " + branch.city),
            badge(
                online ? "Owner simulator: Online" : "Owner simulator: Offline",
                online ? "online" : "offline"
            ),
            element("p", "Confirmed sales: " + money(branch.confirmedTotal)),
            element("p", "Confirmed records: " + branch.confirmedRecordCount),
            element("p",
                "Pending in this owner browser: " + pending.length +
                " · " + moneyPaise(pendingAmount))
        );

        const button = element(
            "button", "View This Branch", "button secondary full-width"
        );
        button.addEventListener("click", () => {
            if (busy) return;
            chooseBranch(branch.branchId);
            $("ledger").scrollIntoView({ block: "start" });
        });

        const visit = element(
            "a", "Visit Branch Workspace", "button secondary full-width"
        );
        visit.href = "/manager.html?branch=" +
            encodeURIComponent(branch.branchId);
        visit.target = "_blank";
        visit.rel = "noopener";

        card.append(button, visit);
        container.append(card);
    }
}

function recordCard(title, record) {
    const card = document.createElement("div");
    card.append(element("h3", title));
    if (!record) {
        card.append(element("p", "Record unavailable."));
        return card;
    }
    for (const [label, value] of [
        ["Item / Service", record.itemName || "Earlier test record"],
        ["Category", categories[record.category] || "Not recorded"],
        ["Amount", money(record.amount)],
        ["Branch", storeName(record.merchantId)],
        ["Note", record.note || "No note"],
        ["Transaction ID", record.transactionId],
        ["Currency", record.currency],
        ["Created", new Date(record.createdAt).toLocaleString()]
    ]) {
        card.append(element("p", label + ": " + value));
    }
    return card;
}

function renderEvents(container, events) {
    container.replaceChildren();
    if (!events.length) {
        container.append(element("p", "No activity yet.", "empty-state"));
        return;
    }
    for (const entry of events) {
        const card = element(
            "div", undefined, "event-card " + entry.status.toLowerCase()
        );
        card.append(
            element("strong",
                entry.status + " · " + (entry.transactionId || "Device")),
            element("p", entry.reason),
            element("small", new Date(entry.time).toLocaleString())
        );
        container.append(card);
    }
}

function renderVerification() {
    const box = $("verification-result");
    box.replaceChildren();
    box.className = "verification-box";
    const local = selectedRecord();

    if (!local) {
        box.textContent = "Select a sale.";
        return;
    }
    if (!serverAvailable) {
        box.textContent = "Server unavailable. Cannot verify right now.";
        return;
    }

    const remote = serverRecords.find(
        (record) => record.transactionId === local.transactionId
    );
    if (!remote) {
        box.textContent = "Saved on this device. Not found on server.";
        return;
    }

    const match = sameDetails(local, remote);
    box.classList.add(match ? "success" : "error");
    box.append(
        element("strong", match ? "MATCH" : "DETAILS DIFFER"),
        element("p", "Local: " + money(local.amount) +
            " | Server: " + money(remote.amount))
    );
}

function incomingRecord(conflict) {
    return {
        transactionId: conflict.transactionId,
        merchantId: conflict.incomingMerchantId,
        amount: conflict.incomingAmount,
        currency: conflict.incomingCurrency,
        createdAt: conflict.incomingCreatedAt,
        category: conflict.incomingCategory,
        itemName: conflict.incomingItemName,
        note: conflict.incomingNote
    };
}

function renderConflict() {
    const container = $("conflict-details");
    container.replaceChildren();

    if (!conflictsAvailable) {
        container.append(element(
            "p", "Server conflict history unavailable. Refresh to retry.",
            "empty-state"
        ));
        return;
    }

    const views = serverConflicts.filter((view) =>
        branchFilter === "ALL" ||
        view.conflict.incomingMerchantId === branchFilter
    );

    if (!views.length) {
        container.append(element(
            "p", "No conflicts for this branch selection.", "empty-state"
        ));
        return;
    }

    for (const view of views) {
        const conflict = view.conflict;
        const card = element("article", undefined, "merchant-card");

        card.append(
            element("h3", "Review · " + conflict.transactionId),
            badge(conflict.status,
                conflict.status === "OPEN" ? "warning" : "success")
        );

        const grid = element("div", undefined, "conflict-grid");
        grid.append(
            recordCard("Incoming attempt", incomingRecord(conflict)),
            recordCard("Original server sale", view.serverRecord)
        );
        card.append(grid, element(
            "p", "Detected: " +
            new Date(conflict.detectedAt).toLocaleString(), "helper"
        ));

        if (conflict.status === "OPEN") {
            const form = document.createElement("form");
            const noteId = "review-" + conflict.conflictId;
            const label = element("label", "Review note — required");
            label.htmlFor = noteId;

            const note = document.createElement("textarea");
            note.id = noteId;
            note.rows = 3;
            note.maxLength = 500;
            note.required = true;
            note.placeholder = "Explain why the original sale should be kept.";
            note.disabled = busy;

            const button = element(
                "button", "Keep Original & Resolve", "button primary"
            );
            button.type = "submit";
            button.disabled = busy || !view.serverRecord;
            form.append(label, note, button);

            form.addEventListener("submit", (submission) => {
                submission.preventDefault();
                const reviewNote = note.value.trim();

                run(async () => {
                    if (!reviewNote || reviewNote.length > 500) {
                        throw new Error("Enter a review note of 1-500 characters.");
                    }

                    const result = await api(
                        "/conflicts/" +
                        encodeURIComponent(conflict.conflictId) + "/resolve",
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                action: "KEEP_SERVER",
                                note: reviewNote
                            })
                        }
                    );

                    if (result.conflict?.status !== "RESOLVED") {
                        throw new Error("Resolution was not confirmed.");
                    }

                    event("RESOLVED", conflict.transactionId,
                        "Original sale preserved. " + reviewNote);

                    const local = state.records.find(
                        (record) =>
                            record.transactionId === conflict.transactionId
                    );

                    if (local && sameDetails(local, result.serverRecord)) {
                        local.status = "SYNCED";
                        local.reason = "Original sale verified after review.";
                    }

                    await saveState();
                    await refreshServer();
                    notice("Conflict resolved. Original sale preserved.");
                });
            });

            card.append(form);
        } else {
            card.append(
                element("p", "Review: " + conflict.resolutionNote),
                element("p", "Resolved: " +
                    new Date(conflict.resolvedAt).toLocaleString(), "helper")
            );
        }

        container.append(card);
    }
}

function render() {
    const pending = state.records.filter(
        (record) => record.status === "PENDING"
    );
    const localVisible = visibleRecords(state.records);
    const serverVisible = visibleRecords(serverRecords);

    $("confirmed-total").textContent = serverAvailable
        ? moneyPaise(serverRecords.reduce(
            (sum, record) => sum + paise(record.amount), 0n))
        : "Unavailable";

    $("pending-count").textContent = pending.length;
    $("duplicate-count").textContent = state.duplicates;
    $("conflict-count").textContent = conflictsAvailable
        ? serverConflicts.filter(
            (view) => view.conflict.status === "OPEN"
        ).length
        : "Unavailable";

    $("ranchi-pending").textContent = pending.filter(
        (record) => record.merchantId === "RANCHI-01"
    ).length;
    $("patna-pending").textContent = pending.filter(
        (record) => record.merchantId === "PATNA-01"
    ).length;

    $("server-status").textContent =
        serverAvailable ? "Server Connected" : "Server Unavailable";
    $("server-status").className =
        "badge " + (serverAvailable ? "success" : "error");

    document.querySelectorAll(".merchant-toggle").forEach((button) => {
        const online = state.devices[button.dataset.merchant];
        button.textContent = online ? "Online" : "Offline";
        button.className =
            "badge merchant-toggle " + (online ? "online" : "offline");
    });

    $("drop-ack").textContent =
        "Drop Next Confirmation: " + (state.dropAck ? "ON" : "OFF");
    $("selected-transaction").textContent =
        state.selected || "None selected";

    renderBranches();

    const localBody = $("local-transactions");
    localBody.replaceChildren();

    for (const record of localVisible) {
        const row = document.createElement("tr");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "selected-record";
        radio.checked = state.selected === record.transactionId;
        radio.setAttribute("aria-label",
            "Select " + (record.itemName || record.transactionId));
        radio.addEventListener("change", () => run(async () => {
            state.selected = record.transactionId;
            await saveState();
        }));

        const item = document.createElement("div");
        item.append(
            element("strong", record.itemName || "Earlier test record"),
            element("p",
                categories[record.category] || "Category not recorded", "helper")
        );

        const labels = {
            PENDING: "Waiting to Sync",
            SYNCED: "Synced",
            CONFLICT: "Review Needed",
            REJECTED: "Needs Correction"
        };

        cell(row, radio);
        cell(row, item);
        cell(row, storeName(record.merchantId));
        cell(row, money(record.amount));
        cell(row, badge(labels[record.status] || record.status, record.status));
        cell(row, record.reason);
        localBody.append(row);
    }

    if (!localVisible.length) {
        emptyRow(localBody, 6, "No local sales for this branch selection.");
    }

    const details = $("sale-details");
    details.replaceChildren();
    const selected = selectedRecord();
    details.append(selected
        ? recordCard("Sale", selected)
        : element("p", "Select a sale above.", "empty-state"));

    const serverBody = $("server-transactions");
    serverBody.replaceChildren();

    if (serverAvailable) {
        for (const record of serverVisible) {
            const row = document.createElement("tr");
            const item = document.createElement("div");
            item.append(
                element("strong", record.itemName || "Earlier test record"),
                element("p", record.transactionId, "helper")
            );
            cell(row, item);
            cell(row, storeName(record.merchantId));
            cell(row, money(record.amount));
            cell(row, new Date(record.receivedAt).toLocaleString());
            serverBody.append(row);
        }
        if (!serverVisible.length) {
            emptyRow(serverBody, 4, "No server sales for this branch selection.");
        }
    } else {
        emptyRow(serverBody, 4, "Server data unavailable. Refresh to retry.");
    }

    $("ledger-count").textContent = serverAvailable
        ? serverVisible.length + " records · " +
            (branchFilter === "ALL" ? "All Branches" : storeName(branchFilter))
        : "Unavailable";

    renderEvents($("decision-feed"), state.events.slice(0, 8));
    renderEvents($("audit-events"), state.events);
    renderVerification();
    renderConflict();

    document.querySelectorAll("button, select, input, textarea")
        .forEach((control) => {
            if (control.closest("#conflict-details")) return;
            control.disabled = busy;
        });
}

async function run(action) {
    if (busy) return;
    busy = true;
    render();
    try {
        await action();
    } catch (error) {
        notice(error.message, true);
    } finally {
        busy = false;
        render();
    }
}

function payload(record) {
    return {
        transactionId: record.transactionId,
        merchantId: record.merchantId,
        amount: record.amount,
        currency: record.currency,
        createdAt: record.createdAt,
        category: clean(record.category),
        itemName: clean(record.itemName),
        note: clean(record.note)
    };
}

async function send(record, incoming = payload(record)) {
    if (!state.devices[record.merchantId]) {
        notice("Branch is simulated offline. Sale stays on this device.");
        return false;
    }

    event("SENT", record.transactionId, "Sync request sent.");
    await saveState();

    try {
        const result = await api("/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(incoming)
        });

        if (!["ACCEPTED", "DUPLICATE", "CONFLICT", "REJECTED"]
                .includes(result.status)) {
            throw new Error("Unexpected server response.");
        }

        if (state.dropAck) {
            state.dropAck = false;
            event("ACK_LOST", record.transactionId,
                "Response intentionally discarded. Local status unchanged.");
            await saveState();
            notice("Confirmation dropped. Retry safely.");
            return false;
        }

        event(result.status, record.transactionId, result.reason);
        if (result.status === "DUPLICATE") state.duplicates++;

        if (["ACCEPTED", "DUPLICATE"].includes(result.status)) {
            if (!sameDetails(incoming, result.serverRecord)) {
                throw new Error("Server confirmation details do not match.");
            }
            if (sameDetails(incoming, record)) {
                record.status = "SYNCED";
                record.reason = result.reason;
            }
        } else if (result.status === "CONFLICT") {
            record.conflict = {
                incoming: structuredClone(incoming),
                serverRecord: result.serverRecord
            };
            if (sameDetails(incoming, record)) {
                record.status = "CONFLICT";
                record.reason = result.reason;
            }
        } else if (sameDetails(incoming, record)) {
            record.status = "REJECTED";
            record.reason = result.reason;
        }

        await saveState();
        notice(result.status + ": " + result.reason);
        return true;
    } catch (error) {
        event("ERROR", record.transactionId,
            "No verified confirmation. " + error.message);
        await saveState();
        notice("Sync failed. Local sale preserved. " + error.message, true);
        return false;
    }
}

function wireControls() {
    $("branch-filter").addEventListener("change", (change) => {
        chooseBranch(change.target.value);
    });

    $("transaction-form").addEventListener("submit", (submission) => {
        submission.preventDefault();

        const category = $("category").value;
        const itemName = $("item-name").value.trim();
        const note = $("sale-note").value.trim();
        const amount = $("amount").value;
        const merchantId = $("merchant-select").value;

        run(async () => {
            const amountPaise = paise(amount);
            if (amountPaise <= 0n || amountPaise > 999999999999999n) {
                throw new Error("Amount must be positive and within the limit.");
            }
            if (!categories[category]) throw new Error("Choose a category.");
            if (!["RANCHI-01", "PATNA-01"].includes(merchantId)) {
                throw new Error("Choose a valid branch.");
            }
            if (!itemName || itemName.length > 120) {
                throw new Error("Enter an item name, up to 120 characters.");
            }
            if (note.length > 500) {
                throw new Error("Note must be at most 500 characters.");
            }

            const record = {
                transactionId: "TX-" + crypto.randomUUID(),
                merchantId,
                amount: decimal(amountPaise),
                currency: "INR",
                createdAt: new Date().toISOString(),
                category,
                itemName,
                note: note || null,
                status: "PENDING",
                reason: "Saved on this device. Awaiting server confirmation."
            };

            state.records.unshift(record);
            state.selected = record.transactionId;
            event("PENDING", record.transactionId, record.reason);
            await saveState();

            branchFilter = merchantId;
            $("branch-filter").value = merchantId;
            $("target-device").value = merchantId;
            $("item-name").value = "";
            $("amount").value = "";
            $("sale-note").value = "";
            notice("Sale saved for " + storeName(merchantId) +
                ". Use Sync Pending Sales.");
        });
    });

    document.querySelectorAll(".merchant-toggle").forEach((button) => {
        button.addEventListener("click", () => run(async () => {
            const merchant = button.dataset.merchant;
            state.devices[merchant] = !state.devices[merchant];
            event("DEVICE", merchant, "Simulated connection: " +
                (state.devices[merchant] ? "Online" : "Offline"));
            await saveState();
            notice("Owner simulator connection updated.");
        }));
    });

    $("refresh-ledger").addEventListener("click", () => run(refreshServer));

    $("drop-ack").addEventListener("click", () => run(async () => {
        state.dropAck = !state.dropAck;
        await saveState();
        notice("Drop confirmation " +
            (state.dropAck ? "enabled." : "disabled."));
    }));

    $("sync-pending").addEventListener("click", () => run(async () => {
        const merchant = $("target-device").value;
        if (!state.devices[merchant]) {
            throw new Error("Branch is simulated offline. Set it online.");
        }
        const pending = state.records.filter(
            (record) => record.merchantId === merchant &&
                record.status === "PENDING"
        );
        if (!pending.length) notice("No pending sales for this branch.");
        for (const record of pending) {
            if (!await send(record)) break;
        }
        await refreshServer();
    }));

    $("retry-ten").addEventListener("click", () => run(async () => {
        const record = selectedRecord();
        if (!record) throw new Error("Select a sale first.");
        for (let index = 0; index < 10; index++) {
            if (!await send(record)) break;
        }
        await refreshServer();
    }));

    $("inject-conflict").addEventListener("click", () => run(async () => {
        const record = selectedRecord();
        if (!record) throw new Error("Select a sale first.");
        await refreshServer();

        if (!serverAvailable || !serverRecords.some(
            (saved) => saved.transactionId === record.transactionId
        )) {
            throw new Error("Sync this sale before injecting a conflict.");
        }

        const changed = paise(record.amount) + 5000n;
        if (changed > 999999999999999n) {
            throw new Error("Changed amount would exceed the limit.");
        }

        const incoming = payload(record);
        incoming.amount = decimal(changed);
        await send(record, incoming);
        await refreshServer();
    }));

    $("export-report").addEventListener("click", () => {
        const report = {
            exportedAt: new Date().toISOString(),
            simulationOnly: true,
            serverSnapshotAvailable: serverAvailable,
            conflictSnapshotAvailable: conflictsAvailable,
            branchSnapshotAvailable: branchesAvailable,
            localState: state,
            serverSnapshot: serverAvailable ? serverRecords : null,
            serverConflicts: conflictsAvailable ? serverConflicts : null,
            branchOverview: branchesAvailable ? branchOverview : null
        };

        const url = URL.createObjectURL(new Blob(
            [JSON.stringify(report, null, 2)],
            { type: "application/json" }
        ));
        const link = document.createElement("a");
        link.href = url;
        link.download = "syncledger-report-" + Date.now() + ".json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
}

function loadScript(source) {
    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = source;
        script.onload = resolve;
        script.onerror = () => reject(
            new Error("Could not load " + source)
        );
        document.head.append(script);
    });
}

async function initialize() {
    try {
        if (!window.SyncLedgerAuth) {
            await loadScript("/auth-client.js");
        }

        const session = await window.SyncLedgerAuth.loadSession();
        if (session.role !== "OWNER") {
            throw new Error("Owner login required.");
        }

        await openStorage();
        await loadState();
        wireControls();
        render();

        const logoutButton = element(
            "button", "Logout", "button secondary"
        );
        logoutButton.addEventListener("click", () => run(async () => {
            await saveState();
            await window.SyncLedgerAuth.logout();
        }));
        $("refresh-ledger").parentElement.append(logoutButton);

        if (!window.syncLedgerConnectionBanner) {
            await loadScript("/connection-status.js");
        }

        await run(refreshServer);
        if (serverAvailable) {
            notice("Owner dashboard ready. All branches are available.");
        }

        setInterval(() => {
            if (!busy && !document.hidden) run(refreshServer);
        }, 15000);
    } catch (error) {
        notice("Initialization failed: " + error.message, true);
        document.querySelectorAll("button, input, select, textarea")
            .forEach((control) => {
                control.disabled = true;
            });
    }
}

initialize();