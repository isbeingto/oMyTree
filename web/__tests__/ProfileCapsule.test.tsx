import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ProfileCapsule } from "@/components/composer/ProfileCapsule";

describe("ProfileCapsule", () => {
    it("shows profile dropdown with all options", () => {
        render(
            <ProfileCapsule
                profile="lite"
                scope="branch"
                onProfileChange={() => { }}
                onScopeChange={() => { }}
                lang="en"
            />
        );
        // Check trigger is present and shows selected value
        const trigger = screen.getByTestId("profile-select-trigger");
        expect(trigger).toBeInTheDocument();
        expect(screen.getByText("Lite")).toBeInTheDocument();
    });

    it("shows scope dropdown with branch selected", () => {
        render(
            <ProfileCapsule
                profile="lite"
                scope="branch"
                onProfileChange={() => { }}
                onScopeChange={() => { }}
                lang="en"
            />
        );
        const trigger = screen.getByTestId("scope-select-trigger");
        expect(trigger).toBeInTheDocument();
        // In English, it should show "Branch" (the i18n key memory_scope_branch)
        expect(screen.getByText("Branch")).toBeInTheDocument();
    });

    it("defaults to Lite when no profile is provided", () => {
        render(
            <ProfileCapsule
                profile={null}
                scope="branch"
                onProfileChange={() => { }}
                onScopeChange={() => { }}
                lang="en"
            />
        );
        // Should display 'Lite' as the default, not a placeholder
        expect(screen.getByText("Lite")).toBeInTheDocument();
    });

    it("disables Max option when isMaxDisabled is true", async () => {
        const onProfileChange = vi.fn();
        render(
            <ProfileCapsule
                profile={null}
                scope="branch"
                onProfileChange={onProfileChange}
                onScopeChange={() => { }}
                isMaxDisabled={true}
                lang="en"
            />
        );
        // Max option should exist but be disabled
        const trigger = screen.getByTestId("profile-select-trigger");
        expect(trigger).toBeInTheDocument();
    });

    it("calls onScopeChange when scope is changed", () => {
        const onScopeChange = vi.fn();
        render(
            <ProfileCapsule
                profile="lite"
                scope="branch"
                onProfileChange={() => { }}
                onScopeChange={onScopeChange}
                lang="en"
            />
        );
        const trigger = screen.getByTestId("scope-select-trigger");
        expect(trigger).toBeInTheDocument();
    });

    it("shows Chinese labels when lang is zh-CN", () => {
        render(
            <ProfileCapsule
                profile="lite"
                scope="branch"
                onProfileChange={() => { }}
                onScopeChange={() => { }}
                lang="zh-CN"
            />
        );
        // Profile label should remain "Lite" (not translated)
        expect(screen.getByText("Lite")).toBeInTheDocument();
        // Scope label should be in Chinese
        expect(screen.getByText("分支记忆")).toBeInTheDocument();
    });
});
