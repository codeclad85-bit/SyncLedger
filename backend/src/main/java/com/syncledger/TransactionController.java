package com.syncledger;

import java.util.List;
import java.util.Map;

import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
    public SyncResponse sync(@RequestBody SyncRequest request) {
        return service.reconcile(request);
    }

    @GetMapping("/transactions")
    public List<TransactionRecord> transactions() {
        return repository.findAll(
                Sort.by(Sort.Direction.DESC, "receivedAt")
        );
    }
}