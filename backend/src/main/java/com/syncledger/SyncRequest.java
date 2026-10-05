package com.syncledger;

import java.math.BigDecimal;
import java.time.Instant;

public record SyncRequest(
        String transactionId,
        String merchantId,
        BigDecimal amount,
        String currency,
        Instant createdAt,
        String category,
        String itemName,
        String note
) {
}