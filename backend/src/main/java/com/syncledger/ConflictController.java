package com.syncledger;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/conflicts")
public class ConflictController {

    private final ConflictRepository conflictRepository;
    private final TransactionRepository transactionRepository;

    public ConflictController(
            ConflictRepository conflictRepository,
            TransactionRepository transactionRepository) {

        this.conflictRepository = conflictRepository;
        this.transactionRepository = transactionRepository;
    }

    @GetMapping
    public List<ConflictView> getConflicts(
            Authentication authentication) {

        if (isOwner(authentication)) {
            return conflictRepository.findAllByOrderByDetectedAtDesc()
                    .stream()
                    .map(this::toView)
                    .toList();
        }

        String assignedBranch = managerBranch(authentication);

        return conflictRepository.findAllByOrderByDetectedAtDesc()
                .stream()
                .filter(conflict -> assignedBranch.equals(
                        conflict.getIncomingMerchantId()))
                .map(this::toView)
                .filter(view -> view.serverRecord() == null
                        || assignedBranch.equals(
                                view.serverRecord().getMerchantId()))
                .toList();
    }

    @PostMapping("/{conflictId}/resolve")
    public synchronized ConflictView resolveConflict(
            @PathVariable("conflictId") String conflictId,
            @RequestBody ResolveRequest request,
            Authentication authentication) {

        if (!isOwner(authentication)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Only the owner can resolve conflicts."
            );
        }

        if (request == null
                || !"KEEP_SERVER".equals(request.action())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Choose KEEP_SERVER to preserve the original transaction."
            );
        }

        String note = request.note() == null
                ? ""
                : request.note().trim();

        if (note.isEmpty() || note.length() > 500) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Review note must contain 1-500 characters."
            );
        }

        ConflictRecord conflict = conflictRepository
                .findById(conflictId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Conflict not found."
                ));

        TransactionRecord serverRecord = transactionRepository
                .findById(conflict.getTransactionId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Original server transaction is missing. Review required."
                ));

        if ("RESOLVED".equals(conflict.getStatus())) {
            return new ConflictView(conflict, serverRecord);
        }

        conflict.keepServerRecord(note);

        ConflictRecord saved = conflictRepository
                .saveAndFlush(conflict);

        return new ConflictView(saved, serverRecord);
    }

    private ConflictView toView(ConflictRecord conflict) {
        TransactionRecord serverRecord = transactionRepository
                .findById(conflict.getTransactionId())
                .orElse(null);

        return new ConflictView(conflict, serverRecord);
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

    public record ResolveRequest(
            String action,
            String note
    ) {
    }

    public record ConflictView(
            ConflictRecord conflict,
            TransactionRecord serverRecord
    ) {
    }
}