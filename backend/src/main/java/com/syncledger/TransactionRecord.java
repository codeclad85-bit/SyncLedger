package com.syncledger;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "transactions")
public class TransactionRecord {

    @Id
    @Column(nullable = false, updatable = false, length = 64)
    private String transactionId;

    @Column(nullable = false, updatable = false, length = 64)
    private String merchantId;

    @Column(
            nullable = false,
            updatable = false,
            precision = 15,
            scale = 2
    )
    private BigDecimal amount;

    @Column(nullable = false, updatable = false, length = 3)
    private String currency;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false, updatable = false)
    private Instant receivedAt;

    @Column(updatable = false, length = 32)
    private String category;

    @Column(updatable = false, length = 120)
    private String itemName;

    @Column(updatable = false, length = 500)
    private String note;

    public TransactionRecord() {
    }

    public TransactionRecord(
            String transactionId,
            String merchantId,
            BigDecimal amount,
            String currency,
            Instant createdAt,
            Instant receivedAt) {

        this(
                transactionId,
                merchantId,
                amount,
                currency,
                createdAt,
                receivedAt,
                null,
                null,
                null
        );
    }

    public TransactionRecord(
            String transactionId,
            String merchantId,
            BigDecimal amount,
            String currency,
            Instant createdAt,
            Instant receivedAt,
            String category,
            String itemName,
            String note) {

        this.transactionId = transactionId;
        this.merchantId = merchantId;
        this.amount = amount;
        this.currency = currency;
        this.createdAt = createdAt;
        this.receivedAt = receivedAt;
        this.category = category;
        this.itemName = itemName;
        this.note = note;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public String getMerchantId() {
        return merchantId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getCurrency() {
        return currency;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getReceivedAt() {
        return receivedAt;
    }

    public String getCategory() {
        return category;
    }

    public String getItemName() {
        return itemName;
    }

    public String getNote() {
        return note;
    }
}