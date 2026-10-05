"use strict";

const $ = (id) => document.getElementById(id);

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

const categories = {
    GROCERY: "Grocery / Kirana",
    FOOD: "Food & Beverages",
    CLOTHING: "Clothing",
    ELECTRONICS: "Electronics",
    SERVICES: "Services",
    OTHER: "Other"
};

const clean = (value) => {
    const text = String(value ?? "").trim();
    return text || null;
};

const storeName = (id) => ({
    "RANCHI-01": "Ranchi Store",
    "PATNA-01": "Patna Store"
})[id] || id;

function paise(value) {
    const text = String(value);
    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
        throw new Error("Enter a positive amount with up to 2 decimals.");
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

function openStorage() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("syncledger-local", 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore("state");
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
        const transaction = db.transaction("state", "readonly");
        const request = transaction.objectStore("state").get("main");
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
        status, transactionId, reason,
        time: new Date().toISOString()
    });
}

async function api(path, options = {}) {
    const response = await fetch("/api" + path, {
        ...options,
        signal: AbortSignal.timeout(10000),
        cache: "no-store"
    });
    if (!response.ok) {
        throw new Error("Server returned HTTP " + response.status);
    }
    return response.json();
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
        notice("Server unavailable. Local sales are preserved.", true);
    }
    render();
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

function selectedRecord() {
    return state.records.find((r) => r.transactionId === state.selected);
}

function sameDetails(local, remote) {
    if (!local || !remote) return false;
    return local.transactionId === remote.transactionId &&
        local.merchantId === remote.merchantId &&
        local.currency === remote.currency &&
        paise(local.amount) === paise(remote.amount) &&
        Date.parse(local.createdAt) === Date.parse(remote.createdAt) &&
        clean(local.category) === clean(remote.category) &&
        clean(local.itemName) === clean(remote.itemName) &&
        clean(local.note) === clean(remote.note);
}

function visibleRecords(records) {
    return branchFilter === "ALL" ? records :
        records.filter((r) => r.merchantId === branchFilter);
}

function renderBranches() {
    const container = $("branch-overview");
    container.replaceChildren();

    if (!branchesAvailable) {
        $("owner-group").textContent = "Demo branch overview unavailable";
        container.append(element(
            "p", "Refresh after the updated backend starts.", "empty-state"
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
            (r) => r.merchantId === branch.branchId &&
                r.status === "PENDING"
        );
        const pendingAmount = pending.reduce(
            (sum, r) => sum + paise(r.amount), 0n
        );
        const online = state.devices[branch.branchId];

        card.append(
            element("h3", branch.name),
            element("p",
                branch.state + " · District: " + branch.district +
                " · City: " + branch.city),
            badge(online ? "Simulated Online" : "Simulated Offline",
                online ? "online" : "offline"),
            element("p", "Confirmed sales: " + money(branch.confirmedTotal)),
            element("p",
                "Confirmed records: " + branch.confirmedRecordCount),
            element("p",
                "Pending in this browser: " + pending.length +
                " · " + moneyPaise(pendingAmount))
        );

        const button = element(
            "button", "View This Branch", "button secondary full-width"
        );
        button.disabled = busy;
        button.addEventListener("click", () => {
            if (busy) return;
            chooseBranch(branch.branchId);
            $("sales").scrollIntoView({ block: "start" });
        });
        card.append(button);
        container.append(card);
    }
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
    for (const item of events) {
        const card = element(
            "div", undefined, "event-card " + item.status.toLowerCase()
        );
        card.append(
            element("strong",
                item.status + " · " + (item.transactionId || "Device")),
            element("p", item.reason),
            element("small", new Date(item.time).toLocaleString())
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
        (r) => r.transactionId === local.transactionId
    );
    if (!remote) {
        box.textContent = "Saved on this device. Not found on server.";
        return;
    }
    const match = sameDetails(local, remote);
    box.classList.add(match ? "success" : "error");
    box.append(
        element("strong", match ? "MATCH" : "DETAILS DIFFER"),
        element("p",
            "Local: " + money(local.amount) +
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
    if (!serverConflicts.length) {
        container.append(element(
            "p", "No server conflicts recorded.", "empty-state"
        ));
        return;
    }

    for (const view of serverConflicts) {
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

            form.addEventListener("submit", (e) => {
                e.preventDefault();
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
                                action: "KEEP_SERVER", note: reviewNote
                            })
                        }
                    );
                    if (result.conflict?.status !== "RESOLVED") {
                        throw new Error("Resolution was not confirmed.");
                    }
                    event("RESOLVED", conflict.transactionId,
                        "Original sale preserved. " + reviewNote);

                    const local = state.records.find(
                        (r) => r.transactionId === conflict.transactionId
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
    const pending = state.records.filter((r) => r.status === "PENDING");
    const localVisible = visibleRecords(state.records);
    const serverVisible = visibleRecords(serverRecords);

    $("confirmed-total").textContent = serverAvailable
        ? moneyPaise(serverRecords.reduce(
            (sum, r) => sum + paise(r.amount), 0n))
        : "Unavailable";
    $("pending-count").textContent = pending.length;
    $("duplicate-count").textContent = state.duplicates;
    $("conflict-count").textContent = conflictsAvailable
        ? serverConflicts.filter((v) => v.conflict.status === "OPEN").length
        : "Unavailable";

    $("ranchi-pending").textContent =
        pending.filter((r) => r.merchantId === "RANCHI-01").length;
    $("patna-pending").textContent =
        pending.filter((r) => r.merchantId === "PATNA-01").length;
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
        radio.disabled = busy;
        radio.setAttribute("aria-label",
            "Select " + (record.itemName || record.transactionId));
        radio.addEventListener("change", () => run(async () => {
            state.selected = record.transactionId;
            await saveState();
        }));

        const item = document.createElement("div");
        item.append(
            element("strong", record.itemName || "Earlier test record"),
            element("p", categories[record.category] ||
                "Category not recorded", "helper")
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
    details.append(selected ? recordCard("Sale", selected) :
        element("p", "Select a sale above.", "empty-state"));

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
        emptyRow(serverBody, 4, "Server unavailable. Refresh to retry.");
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
        .forEach((node) => {
            if (node.closest("#conflict-details")) return;
            node.disabled = busy;
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
            return true;
        }

        event(result.status, record.transactionId, result.reason);
        if (result.status === "DUPLICATE") state.duplicates++;

        if (result.status === "ACCEPTED" || result.status === "DUPLICATE") {
            record.status = "SYNCED";
            record.reason = result.reason;
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
            "No usable confirmation. " + error.message);
        await saveState();
        notice("Sync failed. Local sale preserved. " + error.message, true);
        return false;
    }
}

function wireControls() {
    $("branch-filter").addEventListener("change", (e) => {
        chooseBranch(e.target.value);
    });

    $("transaction-form").addEventListener("submit", (e) => {
        e.preventDefault();
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
            if (!categories[category]) {
                throw new Error("Choose a category.");
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
                category, itemName,
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
            notice("Simulated branch connection updated.");
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
            throw new Error(
                "Branch is simulated offline. Set it online in Testing Lab."
            );
        }
        const pending = state.records.filter(
            (r) => r.merchantId === merchant && r.status === "PENDING"
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
        if (!state.devices[record.merchantId]) {
            throw new Error("Selected branch is simulated offline.");
        }
        for (let i = 0; i < 10; i++) {
            if (!await send(record)) break;
        }
        await refreshServer();
    }));

    $("inject-conflict").addEventListener("click", () => run(async () => {
        const record = selectedRecord();
        if (!record) throw new Error("Select a sale first.");
        await refreshServer();

        if (!serverAvailable || !serverRecords.some(
            (r) => r.transactionId === record.transactionId
        )) {
            throw new Error("Sync this sale before injecting a conflict.");
        }
        const incoming = payload(record);
        const changed = paise(record.amount) + 5000n;
        if (changed > 999999999999999n) {
            throw new Error("Changed amount would exceed the limit.");
        }
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

async function initialize() {
    try {
        await openStorage();
        await loadState();
        wireControls();
        await refreshServer();
        if (serverAvailable) {
            notice("Ready. Record a sale for Ranchi or Patna.");
        }
    } catch (error) {
        notice("Initialization failed: " + error.message, true);
        document.querySelectorAll("button, input, select, textarea")
            .forEach((node) => { node.disabled = true; });
    }
}

initialize();