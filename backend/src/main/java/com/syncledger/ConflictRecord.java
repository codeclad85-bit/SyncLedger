package com.syncledger;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "reconciliation_conflicts")
public class ConflictRecord {

    @Id
    @Column(length = 36, nullable = false, updatable = false)
    private String conflictId;

    @Column(length = 64, nullable = false, updatable = false)
    private String transactionId;

    @Column(length = 64, nullable = false, updatable = false)
    private String incomingMerchantId;

    @Column(
            precision = 15,
            scale = 2,
            nullable = false,
            updatable = false
    )
    private BigDecimal incomingAmount;

    @Column(length = 3, nullable = false, updatable = false)
    private String incomingCurrency;

    @Column(nullable = false, updatable = false)
    private Instant incomingCreatedAt;

    @Column(length = 32, updatable = false)
    private String incomingCategory;

    @Column(length = 120, updatable = false)
    private String incomingItemName;

    @Column(length = 500, updatable = false)
    private String incomingNote;

    @Column(length = 24, nullable = false)
    private String status;

    @Column(nullable = false, updatable = false)
    private Instant detectedAt;

    private Instant resolvedAt;

    @Column(length = 500)
    private String resolutionNote;

    protected ConflictRecord() {
    }

    public ConflictRecord(SyncRequest request) {
        this.conflictId = UUID.randomUUID().toString();
        this.transactionId = request.transactionId();
        this.incomingMerchantId = request.merchantId();
        this.incomingAmount = request.amount()
                .setScale(2, RoundingMode.UNNECESSARY);
        this.incomingCurrency = request.currency();
        this.incomingCreatedAt = request.createdAt()
                .truncatedTo(ChronoUnit.MILLIS);
        this.incomingCategory = clean(request.category());
        this.incomingItemName = clean(request.itemName());
        this.incomingNote = clean(request.note());
        this.status = "OPEN";
        this.detectedAt = Instant.now()
                .truncatedTo(ChronoUnit.MILLIS);
    }

    public void keepServerRecord(String note) {
        if (!"OPEN".equals(status)) {
            return;
        }

        this.status = "RESOLVED";
        this.resolvedAt = Instant.now()
                .truncatedTo(ChronoUnit.MILLIS);
        this.resolutionNote = note;
    }

    private static String clean(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }

        return value.trim();
    }

    public String getConflictId() {
        return conflictId;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public String getIncomingMerchantId() {
        return incomingMerchantId;
    }

    public BigDecimal getIncomingAmount() {
        return incomingAmount;
    }

    public String getIncomingCurrency() {
        return incomingCurrency;
    }

    public Instant getIncomingCreatedAt() {
        return incomingCreatedAt;
    }

    public String getIncomingCategory() {
        return incomingCategory;
    }

    public String getIncomingItemName() {
        return incomingItemName;
    }

    public String getIncomingNote() {
        return incomingNote;
    }

    public String getStatus() {
        return status;
    }

    public Instant getDetectedAt() {
        return detectedAt;
    }

    public Instant getResolvedAt() {
        return resolvedAt;
    }

    public String getResolutionNote() {
        return resolutionNote;
    }
}