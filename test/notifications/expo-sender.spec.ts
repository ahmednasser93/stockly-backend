
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendExpoPush, sendExpoPushWithLogs, sendExpoPushBatch, ExpoPushMessage } from '../../src/notifications/expo-sender';

describe('Expo Sender', () => {
    // Mock fetch
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    beforeEach(() => {
        fetchMock.mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    const VALID_TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxx]';
    const TEST_TITLE = 'Test Title';
    const TEST_BODY = 'Test Body';

    describe('sendExpoPush', () => {
        it('should return false for invalid token', async () => { // and log error
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const result = await sendExpoPush('invalid-token', TEST_TITLE, TEST_BODY);
            expect(result).toBe(false);
            consoleSpy.mockRestore();
        });

        it('should return true on successful send', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                headers: new Map(),
                json: async () => ({
                    data: [{ status: 'ok', id: 'ticket-id' }]
                })
            });

            const result = await sendExpoPush(VALID_TOKEN, TEST_TITLE, TEST_BODY);
            expect(result).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('should retry on temporary error', async () => {
            // First call fails (network error equivalent)
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Map(),
                text: async () => 'Unavailable'
            });
            // Second call succeeds
            fetchMock.mockResolvedValueOnce({
                ok: true,
                headers: new Map(),
                json: async () => ({
                    data: [{ status: 'ok', id: 'ticket-id' }]
                })
            });

            const result = await sendExpoPush(VALID_TOKEN, TEST_TITLE, TEST_BODY);
            expect(result).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('should return false if all retries fail', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                headers: new Map(),
                text: async () => 'Error'
            });

            const result = await sendExpoPush(VALID_TOKEN, TEST_TITLE, TEST_BODY);
            expect(result).toBe(false);
            expect(fetchMock).toHaveBeenCalledTimes(3); // Max retries
        }, 10000); // Increase timeout for retries
    });

    it('should handle network exception and retry', async () => {
        fetchMock.mockRejectedValueOnce(new Error('Network error'));
        fetchMock.mockResolvedValueOnce({
            ok: true,
            headers: new Map(),
            json: async () => ({
                data: [{ status: 'ok', id: 'ticket-id' }]
            })
        });

        const result = await sendExpoPush(VALID_TOKEN, TEST_TITLE, TEST_BODY);
        expect(result).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should handle malformed JSON response and retry', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            headers: new Map(),
            json: async () => { throw new Error('Invalid JSON'); }
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            headers: new Map(),
            json: async () => ({
                data: [{ status: 'ok', id: 'ticket-id' }]
            })
        });

        const result = await sendExpoPush(VALID_TOKEN, TEST_TITLE, TEST_BODY);
        expect(result).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should retry on 429 Too Many Requests', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            headers: new Map(),
            text: async () => 'Rate limit exceeded'
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            headers: new Map(),
            json: async () => ({
                data: [{ status: 'ok', id: 'ticket-id' }]
            })
        });

        const result = await sendExpoPush(VALID_TOKEN, TEST_TITLE, TEST_BODY);
        expect(result).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });


    describe('sendExpoPushWithLogs', () => {
        it('should return Detailed logs on success', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                headers: new Map(),
                json: async () => ({
                    data: [{ status: 'ok', id: 'ticket-id' }]
                })
            });

            const result = await sendExpoPushWithLogs(VALID_TOKEN, TEST_TITLE, TEST_BODY);
            expect(result.success).toBe(true);
            expect(result.logs.length).toBeGreaterThan(0);
            expect(result.logs.some(l => l.includes('SUCCESS'))).toBe(true);
        });

        it('should return error info on permanent error (DeviceNotRegistered)', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                headers: new Map(),
                json: async () => ({
                    data: [{ status: 'error', message: 'DeviceNotRegistered', details: { error: 'DeviceNotRegistered' } }]
                })
            });

            const result = await sendExpoPushWithLogs(VALID_TOKEN, TEST_TITLE, TEST_BODY);
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('DEVICE_NOT_REGISTERED');
            expect(result.shouldCleanupToken).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(1); // Should NOT retry permanent error
        });

        it('should handle "Message Too Big" error', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                headers: new Map(),
                json: async () => ({
                    data: [{ status: 'error', message: 'Message Too Big', details: { error: 'Payload too large' } }]
                })
            });

            const result = await sendExpoPushWithLogs(VALID_TOKEN, TEST_TITLE, TEST_BODY);
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('MESSAGE_TOO_BIG');
            expect(result.shouldCleanupToken).toBe(false);
            expect(fetchMock).toHaveBeenCalledTimes(1); // Permanent error
        });

        it('should handle "Invalid Token" error', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                headers: new Map(),
                json: async () => ({
                    data: [{ status: 'error', message: 'Invalid Token', details: { error: 'Invalid Token' } }]
                })
            });

            const result = await sendExpoPushWithLogs(VALID_TOKEN, TEST_TITLE, TEST_BODY);
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('INVALID_TOKEN');
            expect(result.shouldCleanupToken).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('should handle "Rate Limit" error from body', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                headers: new Map(),
                json: async () => ({
                    data: [{ status: 'error', message: 'Rate Limit Exceeded' }]
                })
            });
            fetchMock.mockResolvedValueOnce({
                ok: true,
                headers: new Map(),
                json: async () => ({
                    data: [{ status: 'ok', id: 'ticket-id' }]
                })
            });

            const result = await sendExpoPushWithLogs(VALID_TOKEN, TEST_TITLE, TEST_BODY);
            expect(result.success).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(2); // Retried
        });

        it('should handle HTTP error response parsing', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                headers: new Map(),
                text: async () => 'Server Error Body'
            });
            fetchMock.mockResolvedValueOnce({
                ok: true,
                headers: new Map(),
                json: async () => ({
                    data: [{ status: 'ok', id: 'ticket-id' }]
                })
            });

            const result = await sendExpoPushWithLogs(VALID_TOKEN, TEST_TITLE, TEST_BODY);
            expect(result.success).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('should handle permanent HTTP error (401/403 implicit?) actually logic only checks message for permanent', async () => {
            // The classify logic uses message content mostly, but lets verify the HTTP error path functionality
            fetchMock.mockResolvedValue({
                ok: false,
                status: 400,
                statusText: 'Bad Request',
                headers: new Map(),
                text: async () => 'Invalid Push Token'
            });

            const result = await sendExpoPushWithLogs(VALID_TOKEN, TEST_TITLE, TEST_BODY);
            expect(result.success).toBe(false);
            expect(result.errorType).toBe('UNKNOWN_ERROR');
            expect(result.shouldCleanupToken).toBe(false);
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        it('should handle JSON parsing error', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: true,
                headers: new Map(),
                json: async () => { throw new Error('Bad JSON'); }
            });
            fetchMock.mockResolvedValueOnce({
                ok: true,
                headers: new Map(),
                json: async () => ({
                    data: [{ status: 'ok', id: 'ticket-id' }]
                })
            });

            const result = await sendExpoPushWithLogs(VALID_TOKEN, TEST_TITLE, TEST_BODY);
            expect(result.success).toBe(true);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });


        it('should handle missing ticket in response', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                headers: new Map(),
                json: async () => ({
                    data: [] // No ticket
                })
            });

            const result = await sendExpoPushWithLogs(VALID_TOKEN, TEST_TITLE, TEST_BODY);
            // It retries on missing ticket? implementation says:
            // if (!ticket) ... if (attempt === MAX_RETRIES) return failure
            // So it retries.
            expect(result.success).toBe(false);
            expect(result.finalError).toContain('No ticket');
            expect(fetchMock).toHaveBeenCalledTimes(3);
        }, 10000);
    });

    describe('sendExpoPushBatch', () => {
        it('should send multiple messages and assume optimistic success counting based on mock', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                headers: new Map(),
                json: async () => ({
                    data: [{ status: 'ok', id: 'ticket-id' }]
                })
            });

            const messages = [
                { pushToken: VALID_TOKEN, title: '1', body: '1' },
                { pushToken: VALID_TOKEN, title: '2', body: '2' }
            ];

            const result = await sendExpoPushBatch(messages);
            expect(result.success).toBe(2);
            expect(result.failed).toBe(0);
        });
    });
});
