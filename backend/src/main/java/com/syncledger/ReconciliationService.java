package com.syncledger;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.Set;

import org.springframework.stereotype.Service;

@Service
public class ReconciliationService {

    private static final Set<String> CATEGORIES = Set.of(
            "GROCERY",
            "FOOD",
            "CLOTHING",
            "ELECTRONICS",
            "SERVICES",
            "OTHER"
    );

    private final TransactionRepository repository;
    private final ConflictRepository conflictRepository;

    public ReconciliationService(
            TransactionRepository repository,
            ConflictRepository conflictRepository) {
        this.repository = repository;
        this.conflictRepository = conflictRepository;
    }

    public synchronized SyncResponse reconcile(SyncRequest request) {

        String error = validate(request);

        if (error != null) {
            return new SyncResponse(
                    request == null ? null : request.transactionId(),
                    "REJECTED",
                    error,
                    null
            );
        }

        BigDecimal amount = request.amount()
                .setScale(2, RoundingMode.UNNECESSARY);

        Instant createdAt = request.createdAt()
                .truncatedTo(ChronoUnit.MILLIS);

        String category = clean(request.category());
        String itemName = clean(request.itemName());
        String note = clean(request.note());

        TransactionRecord existing = repository
                .findById(request.transactionId())
                .orElse(null);

        if (existing != null) {

            boolean sameDetails =
                    existing.getMerchantId().equals(request.merchantId())
                    && existing.getAmount().compareTo(amount) == 0
                    && existing.getCurrency().equals(request.currency())
                    && existing.getCreatedAt().equals(createdAt)
                    && Objects.equals(
                            clean(existing.getCategory()), category)
                    && Objects.equals(
                            clean(existing.getItemName()), itemName)
                    && Objects.equals(
                            clean(existing.getNote()), note);

            if (sameDetails) {
                return new SyncResponse(
                        request.transactionId(),
                        "DUPLICATE",
                        "Already saved. Amount was not counted again.",
                        existing
                );
            }

            conflictRepository.saveAndFlush(
                    new ConflictRecord(request)
            );

            return new SyncResponse(
                    request.transactionId(),
                    "CONFLICT",
                    "Same transaction ID has different details. Review required.",
                    existing
            );
        }

        TransactionRecord record = new TransactionRecord(
                request.transactionId(),
                request.merchantId(),
                amount,
                request.currency(),
                createdAt,
                Instant.now().truncatedTo(ChronoUnit.MILLIS),
                category,
                itemName,
                note
        );

        TransactionRecord saved = repository.saveAndFlush(record);

        return new SyncResponse(
                saved.getTransactionId(),
                "ACCEPTED",
                "New transaction verified and saved.",
                saved
        );
    }

    private String validate(SyncRequest request) {

        if (request == null) {
            return "Transaction details are required.";
        }

        if (!validId(request.transactionId())) {
            return "Transaction ID must contain 1-64 letters, numbers, _ or -.";
        }

        if (!validId(request.merchantId())) {
            return "Merchant ID must contain 1-64 letters, numbers, _ or -.";
        }

        if (request.amount() == null
                || request.amount().compareTo(BigDecimal.ZERO) <= 0) {
            return "Amount must be greater than zero.";
        }

        if (request.amount().compareTo(
                new BigDecimal("9999999999999.99")) > 0) {
            return "Amount exceeds the supported limit.";
        }

        try {
            request.amount().setScale(2, RoundingMode.UNNECESSARY);
        } catch (ArithmeticException exception) {
            return "Amount must have no more than two decimal places.";
        }

        if (!"INR".equals(request.currency())) {
            return "This simulator supports INR only.";
        }

        if (request.createdAt() == null) {
            return "Transaction creation time is required.";
        }

        if (request.createdAt().isBefore(
                Instant.parse("2000-01-01T00:00:00Z"))) {
            return "Transaction creation time is too old.";
        }

        if (request.createdAt().isAfter(
                Instant.now().plusSeconds(300))) {
            return "Transaction creation time is in the future.";
        }

        String category = clean(request.category());
        String itemName = clean(request.itemName());
        String note = clean(request.note());

        if (category != null && !CATEGORIES.contains(category)) {
            return "Choose a supported category.";
        }

        if (itemName != null && itemName.length() > 120) {
            return "Item or service name must be at most 120 characters.";
        }

        if (note != null && note.length() > 500) {
            return "Note must be at most 500 characters.";
        }

        if ((category == null) != (itemName == null)) {
            return "Provide both category and item or service name.";
        }

        return null;
    }

    private String clean(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }

        return value.trim();
    }

    private boolean validId(String value) {
        return value != null
                && value.matches("[A-Za-z0-9_-]{1,64}");
    }
}