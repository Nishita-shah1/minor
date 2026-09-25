import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserFingerprintEngine } from "./worker-client";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  reply(data: unknown) { this.onmessage?.({ data }); }
}

beforeEach(() => { FakeWorker.instances = []; vi.stubGlobal("Worker", FakeWorker); vi.useFakeTimers(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("allows one operation and ignores stale replies", async () => {
  const engine = new BrowserFingerprintEngine();
  const pending = engine.initialize("encode");
  const worker = FakeWorker.instances[0];
  await expect(engine.initialize("decode")).rejects.toThrow("busy");
  worker.reply({ id: "stale", result: { kind: "disposed" } });
  const id = worker.postMessage.mock.calls[0][0].id;
  worker.reply({ id, result: { kind: "runtime", value: { provider: "webgpu", profile: "test", qualified: false } } });
  await expect(pending).resolves.toMatchObject({ qualified: false });
  engine.cancel();
});

it("terminates and rejects cancelled work before creating another worker", async () => {
  const engine = new BrowserFingerprintEngine();
  const pending = engine.initialize("encode");
  engine.cancel();
  await expect(pending).rejects.toThrow("cancelled");
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  const retry = engine.initialize("decode");
  expect(FakeWorker.instances).toHaveLength(2);
  engine.cancel();
  await expect(retry).rejects.toThrow("cancelled");
});

it("bounds stalled operations and reports fatal worker failures", async () => {
  const failure = vi.fn();
  const engine = new BrowserFingerprintEngine(failure);
  const pending = engine.initialize("encode");
  const rejected = expect(pending).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(180_000);
  await rejected;
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  const retry = engine.initialize("decode");
  FakeWorker.instances[1].reply({ id: null, error: "GPU lost" });
  await expect(retry).rejects.toThrow("GPU lost");
  expect(failure).toHaveBeenCalledWith("GPU lost");
});

it("releases sessions before terminating an idle worker", async () => {
  const engine = new BrowserFingerprintEngine();
  const ready = engine.initialize("decode");
  const worker = FakeWorker.instances[0];
  worker.reply({ id: worker.postMessage.mock.calls[0][0].id, result: { kind: "runtime", value: {} } });
  await ready;
  const disposal = engine.dispose();
  expect(worker.postMessage.mock.calls[1][0].operation).toBe("dispose");
  worker.reply({ id: worker.postMessage.mock.calls[1][0].id, result: { kind: "disposed" } });
  await disposal;
  expect(worker.terminate).toHaveBeenCalledOnce();
});
