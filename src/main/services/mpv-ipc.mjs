import net from "node:net";
export class MpvIPC {
  constructor() {
    this.sequence = 0;
    this.pending = new Map();
    this.buffer = "";
  }
  async connect(path) {
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          const socket = net.createConnection(path);
          socket.once("error", reject);
          socket.once("connect", () => {
            socket.removeListener("error", reject);
            this.socket = socket;
            resolve();
          });
        });
        this.socket.on("data", (data) => this.feed(data.toString()));
        this.socket.on("error", () => this.close());
        this.socket.on("close", () => this.close());
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error("MPV did not start its control connection.");
  }
  feed(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > 1024 * 1024) {
      this.close();
      return;
    }
    let split;
    while ((split = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, split);
      this.buffer = this.buffer.slice(split + 1);
      let data;
      try {
        data = JSON.parse(line);
      } catch {
        continue;
      }
      const pending = this.pending.get(data.request_id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(data.request_id);
        data.error === "success" ? pending.resolve(data.data) : pending.reject(new Error(`MPV: ${data.error}`));
      } else this.onEvent?.(data);
    }
  }
  command(command) {
    if (!this.socket || this.socket.destroyed) return Promise.reject(new Error("Player is not connected."));
    const request_id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request_id);
        reject(new Error("MPV command timed out."));
      }, 5000);
      this.pending.set(request_id, { resolve, reject, timer });
      this.socket.write(JSON.stringify({ command, request_id }) + "\n");
    });
  }
  close() {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Player disconnected."));
    }
    this.pending.clear();
    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
  }
}
