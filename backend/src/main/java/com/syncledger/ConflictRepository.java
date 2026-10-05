package com.syncledger;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ConflictRepository
        extends JpaRepository<ConflictRecord, String> {

    List<ConflictRecord> findAllByOrderByDetectedAtDesc();
}