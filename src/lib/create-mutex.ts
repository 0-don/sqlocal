export type Mutex = {
	lock: () => Promise<void>;
	unlock: () => Promise<void>;
};

export function createMutex(): Mutex {
	// FIFO chain. Each `lock()` returns a promise that resolves when the
	// previous holder calls `unlock()`. The prior `while (promise) await
	// promise` implementation lost waiters when multiple callers entered
	// `lock()` in the same microtask: they all observed `promise ===
	// undefined`, each installed their own promise, and only the last
	// writer's resolver was tracked, leaving earlier waiters orphaned.
	let tail: Promise<void> = Promise.resolve();
	let releaseCurrent: (() => void) | null = null;

	const lock = (): Promise<void> => {
		let release: () => void;
		const next = new Promise<void>((res) => {
			release = res;
		});
		const ticket = tail.then(() => {
			releaseCurrent = release;
		});
		tail = next;
		return ticket;
	};

	const unlock = async (): Promise<void> => {
		const r = releaseCurrent;
		releaseCurrent = null;
		r?.();
	};

	return { lock, unlock };
}
