package com.syncledger;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

@Configuration
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public UserDetailsService userDetailsService(
            PasswordEncoder encoder,
            @Value("${SYNCLEDGER_OWNER_PASSWORD}") String ownerPassword,
            @Value("${SYNCLEDGER_RANCHI_PASSWORD}") String ranchiPassword,
            @Value("${SYNCLEDGER_PATNA_PASSWORD}") String patnaPassword) {

        return new InMemoryUserDetailsManager(
                User.withUsername("owner")
                        .password(encoder.encode(ownerPassword))
                        .authorities("ROLE_OWNER")
                        .build(),

                User.withUsername("ranchi")
                        .password(encoder.encode(ranchiPassword))
                        .authorities("ROLE_MANAGER", "BRANCH_RANCHI-01")
                        .build(),

                User.withUsername("patna")
                        .password(encoder.encode(patnaPassword))
                        .authorities("ROLE_MANAGER", "BRANCH_PATNA-01")
                        .build()
        );
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http) throws Exception {

        http
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(
                                "/login",
                                "/error",
                                "/favicon.ico",
                                "/style.css",
                                "/connection-status.js",
                                "/auth-client.js",
                                "/api/health"
                        ).permitAll()

                        .requestMatchers(
                                "/",
                                "/index.html",
                                "/app.js",
                                "/api/branches",
                                "/api/conflicts/*/resolve"
                        ).hasRole("OWNER")

                        .requestMatchers(
                                "/manager.html",
                                "/manager.js",
                                "/api/auth/me",
                                "/api/auth/csrf",
                                "/api/transactions",
                                "/api/conflicts",
                                "/api/sync"
                        ).hasAnyRole("OWNER", "MANAGER")

                        .anyRequest().denyAll()
                )

                .csrf(csrf -> csrf
                        .csrfTokenRepository(
                                CookieCsrfTokenRepository.withHttpOnlyFalse()
                        )
                )

                .formLogin(form -> form
                        .successHandler((request, response, authentication) -> {
                            boolean owner = authentication.getAuthorities()
                                    .stream()
                                    .anyMatch(authority ->
                                            authority.getAuthority()
                                                    .equals("ROLE_OWNER"));

                            if (owner) {
                                response.sendRedirect("/");
                                return;
                            }

                            boolean ranchi = authentication.getAuthorities()
                                    .stream()
                                    .anyMatch(authority ->
                                            authority.getAuthority()
                                                    .equals("BRANCH_RANCHI-01"));

                            response.sendRedirect(
                                    "/manager.html?branch="
                                            + (ranchi ? "RANCHI-01" : "PATNA-01")
                            );
                        })
                        .permitAll()
                )

                .logout(logout -> logout
                        .logoutSuccessUrl("/login?logout")
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .deleteCookies("JSESSIONID", "XSRF-TOKEN")
                        .permitAll()
                );

        return http.build();
    }
}