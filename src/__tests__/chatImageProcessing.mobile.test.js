import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../utils/chatImageProcessing';

describe('[P1-CHAT-MULTI-IMAGE] cola de trabajo móvil', () => {
    it('conserva el orden y nunca supera la concurrencia indicada', async () => {
        let active = 0;
        let maximum = 0;
        const result = await mapWithConcurrency([40, 5, 20, 1], 2, async (delay, index) => {
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise((resolve) => setTimeout(resolve, delay));
            active -= 1;
            return `item-${index}`;
        });
        expect(maximum).toBe(2);
        expect(result).toEqual(['item-0', 'item-1', 'item-2', 'item-3']);
    });

    it('deja de programar trabajo nuevo después del primer fallo', async () => {
        const started = [];
        await expect(mapWithConcurrency([0, 1, 2, 3], 1, async (value) => {
            started.push(value);
            if (value === 1) throw new Error('fallo');
            return value;
        })).rejects.toThrow('fallo');
        expect(started).toEqual([0, 1]);
    });
});
