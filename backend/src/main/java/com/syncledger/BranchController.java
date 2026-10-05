package com.syncledger;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/branches")
public class BranchController {

    private final TransactionRepository transactionRepository;

    public BranchController(
            TransactionRepository transactionRepository) {
        this.transactionRepository = transactionRepository;
    }

    @GetMapping
    public BranchOverview getBranches() {

        List<TransactionRecord> transactions =
                transactionRepository.findAll();

        List<BranchSummary> branches = List.of(
                summarize(
                        "RANCHI-01",
                        "Ranchi Store",
                        "Jharkhand",
                        "Ranchi",
                        "Ranchi",
                        transactions
                ),
                summarize(
                        "PATNA-01",
                        "Patna Store",
                        "Bihar",
                        "Patna",
                        "Patna",
                        transactions
                )
        );

        BigDecimal combinedTotal = branches.stream()
                .map(BranchSummary::confirmedTotal)
                .reduce(new BigDecimal("0.00"), BigDecimal::add);

        long combinedRecordCount = branches.stream()
                .mapToLong(BranchSummary::confirmedRecordCount)
                .sum();

        return new BranchOverview(
                "DEMO-OWNER-01",
                "Demo Store Group",
                true,
                branches,
                combinedTotal,
                combinedRecordCount
        );
    }

    private BranchSummary summarize(
            String branchId,
            String name,
            String state,
            String district,
            String city,
            List<TransactionRecord> transactions) {

        List<TransactionRecord> branchRecords = transactions.stream()
                .filter(record ->
                        branchId.equals(record.getMerchantId()))
                .toList();

        BigDecimal total = branchRecords.stream()
                .map(TransactionRecord::getAmount)
                .reduce(new BigDecimal("0.00"), BigDecimal::add);

        return new BranchSummary(
                branchId,
                name,
                state,
                district,
                city,
                total,
                branchRecords.size()
        );
    }

    public record BranchOverview(
            String ownerId,
            String groupName,
            boolean simulationOnly,
            List<BranchSummary> branches,
            BigDecimal combinedTotal,
            long combinedRecordCount
    ) {
    }

    public record BranchSummary(
            String branchId,
            String name,
            String state,
            String district,
            String city,
            BigDecimal confirmedTotal,
            long confirmedRecordCount
    ) {
    }
}