import { describe, it, expect } from 'vitest';
import { createMutex } from '../src/lib/create-mutex.js';

describe('createMutex', () => {
	it('serializes concurrent lock() calls into FIFO order', async () => {
		const m = createMutex();
		const order: number[] = [];

		const work = async (id: number, delay: number) => {
			await m.lock();
			order.push(id);
			await new Promise((r) => setTimeout(r, delay));
			await m.unlock();
		};

		await Promise.all([work(1, 20), work(2, 10), work(3, 5)]);
		expect(order).toEqual([1, 2, 3]);
	});

	it('does not deadlock when many lock() calls race in the same tick', async () => {
		// Regression test: prior implementation used a single `promise`/`resolve`
		// pair plus `while (promise) await promise`, which lost waiters when
		// multiple callers entered `lock()` synchronously.
		const m = createMutex();
		let executed = 0;

		const tasks = Array.from({ length: 50 }, async () => {
			await m.lock();
			executed += 1;
			await m.unlock();
		});

		await Promise.all(tasks);
		expect(executed).toBe(50);
	});

	it('supports interleaved lock/unlock pairs', async () => {
		const m = createMutex();

		await m.lock();
		await m.unlock();
		await m.lock();
		await m.unlock();

		const events: string[] = [];
		await Promise.all([
			(async () => {
				await m.lock();
				events.push('A');
				await m.unlock();
			})(),
			(async () => {
				await m.lock();
				events.push('B');
				await m.unlock();
			})(),
		]);
		expect(events).toEqual(['A', 'B']);
	});
});
