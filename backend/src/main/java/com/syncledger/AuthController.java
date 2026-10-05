package com.syncledger;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public record UserSession(
            String username,
            String role,
            String branchId) {
    }

    public record CsrfResponse(
            String headerName,
            String token) {
    }

    @GetMapping("/me")
    public UserSession currentUser(Authentication authentication) {

        boolean owner = authentication.getAuthorities().stream()
                .anyMatch(authority ->
                        authority.getAuthority().equals("ROLE_OWNER"));

        if (owner) {
            return new UserSession(
                    authentication.getName(),
                    "OWNER",
                    null
            );
        }

        String branchId = authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .filter(authority -> authority.startsWith("BRANCH_"))
                .map(authority -> authority.substring("BRANCH_".length()))
                .findFirst()
                .orElse(null);

        return new UserSession(
                authentication.getName(),
                "MANAGER",
                branchId
        );
    }

    @GetMapping("/csrf")
    public CsrfResponse csrfToken(CsrfToken csrfToken) {
        return new CsrfResponse(
                csrfToken.getHeaderName(),
                csrfToken.getToken()
        );
    }
}