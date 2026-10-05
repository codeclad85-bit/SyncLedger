package com.syncledger;

public record SyncResponse(
        String transactionId,
        String status,
        String reason,
        TransactionRecord serverRecord
) {
}