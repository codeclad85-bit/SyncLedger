package com.syncledger;

import java.util.List;
import java.util.Map;

import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class TransactionController {

    private final ReconciliationService service;
    private final TransactionRepository repository;

    public TransactionController(
            ReconciliationService service,
            TransactionRepository repository) {

        this.service = service;
        this.repository = repository;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of(
                "status", "UP",
                "application", "SyncLedger"
        );
    }

    @PostMapping("/sync")
    public SyncResponse sync(
            @RequestBody SyncRequest request,
            Authentication authentication) {

        if (!isOwner(authentication)) {
            String assignedBranch = managerBranch(authentication);

            if (request == null
                    || !assignedBranch.equals(request.merchantId())) {

                throw new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "You can sync sales only for your assigned branch."
                );
            }

            /*
             * Prevent another branch's existing transaction from being
             * exposed through a duplicate or conflict response.
             */
            if (request.transactionId() != null) {
                TransactionRecord existing = repository
                        .findById(request.transactionId())
                        .orElse(null);

                if (existing != null
                        && !assignedBranch.equals(existing.getMerchantId())) {

                    throw new ResponseStatusException(
                            HttpStatus.FORBIDDEN,
                            "This transaction is not accessible."
                    );
                }
            }
        }

        return service.reconcile(request);
    }

    @GetMapping("/transactions")
    public List<TransactionRecord> transactions(
            Authentication authentication) {

        List<TransactionRecord> records = repository.findAll(
                Sort.by(Sort.Direction.DESC, "receivedAt")
        );

        if (isOwner(authentication)) {
            return records;
        }

        String assignedBranch = managerBranch(authentication);

        return records.stream()
                .filter(record ->
                        assignedBranch.equals(record.getMerchantId()))
                .toList();
    }

    private boolean isOwner(Authentication authentication) {
        return authentication != null
                && authentication.getAuthorities().stream()
                        .anyMatch(authority ->
                                authority.getAuthority().equals("ROLE_OWNER"));
    }

    private String managerBranch(Authentication authentication) {

        if (authentication == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Login required."
            );
        }

        boolean manager = authentication.getAuthorities().stream()
                .anyMatch(authority ->
                        authority.getAuthority().equals("ROLE_MANAGER"));

        if (!manager) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Branch manager access required."
            );
        }

        return authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .filter(authority ->
                        authority.equals("BRANCH_RANCHI-01")
                                || authority.equals("BRANCH_PATNA-01"))
                .map(authority ->
                        authority.substring("BRANCH_".length()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "No branch assigned to this account."
                ));
    }
}