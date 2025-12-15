import { describe, it, expect } from "vitest";
import {
    validateUsername,
    validateUsernameFormat,
    isReservedWord,
    normalizeUsername,
    RESERVED_WORDS,
} from "../../src/auth/username-validation";

describe("Username Validation", () => {
    describe("validateUsernameFormat", () => {
        it("accepts valid usernames", () => {
            const valid = ["john_doe", "jane-doe", "user123", "User_Name-1"];
            for (const u of valid) {
                expect(validateUsernameFormat(u).valid).toBe(true);
            }
        });

        it("rejects too short usernames (< 3)", () => {
            const result = validateUsernameFormat("ab");
            expect(result.valid).toBe(false);
            expect(result.error).toContain("at least 3 characters");
        });

        it("rejects too long usernames (> 20)", () => {
            const result = validateUsernameFormat("a".repeat(21));
            expect(result.valid).toBe(false);
            expect(result.error).toContain("at most 20 characters");
        });

        it("rejects usernames starting with special char", () => {
            expect(validateUsernameFormat("_user").valid).toBe(false);
            expect(validateUsernameFormat("-user").valid).toBe(false);
        });

        it("rejects usernames ending with special char", () => {
            expect(validateUsernameFormat("user_").valid).toBe(false);
            expect(validateUsernameFormat("user-").valid).toBe(false);
        });

        it("rejects consecutive underscores", () => {
            const result = validateUsernameFormat("user__name");
            expect(result.valid).toBe(false);
            expect(result.error).toContain("consecutive special characters");
        });

        it("rejects consecutive hyphens", () => {
            const result = validateUsernameFormat("user--name");
            expect(result.valid).toBe(false);
            expect(result.error).toContain("consecutive special characters");
        });

        it("rejects mixed consecutive special chars", () => {
            expect(validateUsernameFormat("user_-name").valid).toBe(false);
            expect(validateUsernameFormat("user-_name").valid).toBe(false);
        });

        it("rejects invalid characters", () => {
            expect(validateUsernameFormat("user@name").valid).toBe(false);
            expect(validateUsernameFormat("user name").valid).toBe(false);
            expect(validateUsernameFormat("user.name").valid).toBe(false);
        });
    });

    describe("isReservedWord", () => {
        it("identifies reserved words (case insensitive)", () => {
            expect(isReservedWord("admin")).toBe(true);
            expect(isReservedWord("Admin")).toBe(true);
            expect(isReservedWord("stockly")).toBe(true);
            expect(isReservedWord("null")).toBe(true);
        });

        it("allows non-reserved words", () => {
            expect(isReservedWord("john_doe")).toBe(false);
            expect(isReservedWord("stockly_fan")).toBe(false);
        });
    });

    describe("normalizeUsername", () => {
        it("lowercases and trims", () => {
            expect(normalizeUsername("  UserName  ")).toBe("username");
        });
    });

    describe("validateUsername (Comprehensive)", () => {
        it("returns valid for good username", () => {
            const result = validateUsername("Good-User-1");
            expect(result.valid).toBe(true);
        });

        it("returns error for reserved word", () => {
            const result = validateUsername("Admin");
            expect(result.valid).toBe(false);
            expect(result.reason).toBe("reserved");
            expect(result.error).toContain("reserved");
        });

        it("returns error for invalid format", () => {
            const result = validateUsername("bad_");
            expect(result.valid).toBe(false);
            expect(result.reason).toBe("format");
            expect(result.error).toBeDefined();
        });
    });
});
