import { describe, expect, it } from "bun:test";
import { createServer, type Server, type Socket } from "node:net";
import { reachSsh } from "../reach";

// Real loopback sockets: who speaks first and what a refusal looks like are socket behaviours.
function listening(onConnect: (socket: Socket) => void): Promise<Server> {
  const server = createServer(onConnect);

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function portOf(server: Server): number {
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("The test server has no port");
  }

  return address.port;
}

async function against(
  onConnect: (socket: Socket) => void,
  timeoutMs?: number
) {
  const server = await listening(onConnect);

  try {
    return await reachSsh("127.0.0.1", portOf(server), { timeoutMs });
  } finally {
    server.close();
  }
}

describe("reachSsh", () => {
  it("reads the banner the server announces by itself", async () => {
    const reach = await against((socket) => {
      socket.write("SSH-2.0-OpenSSH_9.6p1 Ubuntu-3\r\n");
    });

    expect(reach.reached).toBe(true);
    expect(reach.reached && reach.software).toBe("OpenSSH_9.6p1");
    expect(reach.reached && reach.ms).toBeGreaterThanOrEqual(0);
  });

  it("writes nothing on the server", async () => {
    let received = "";

    await against((socket) => {
      socket.on("data", (chunk) => {
        received += chunk.toString("utf8");
      });
      socket.write("SSH-2.0-OpenSSH_9.6p1\r\n");
    });

    expect(received).toBe("");
  });

  it("says an address speaking something else is not an SSH server", async () => {
    const reach = await against((socket) => {
      socket.write("HTTP/1.1 400 Bad Request\r\n");
    });

    expect(reach.reached).toBe(false);
    expect(reach.reached === false && reach.code).toBe("not-ssh");
    expect(reach.reached === false && reach.phrase.id).toBe(
      "refusal.reach.wrongPort"
    );
  });

  it("says a silent address did not respond in time", async () => {
    const reach = await against(() => undefined, 60);

    expect(reach.reached === false && reach.code).toBe("timeout");
  });

  it("says nothing is listening when the port is closed", async () => {
    const server = await listening(() => undefined);
    const port = portOf(server);

    await new Promise((done) => server.close(done));

    const reach = await reachSsh("127.0.0.1", port, { timeoutMs: 500 });

    expect(reach.reached).toBe(false);
    expect(reach.reached === false && reach.code).toBe("refused");
    expect(reach.reached === false && reach.phrase.values?.port).toBe(port);
  });

  it("refuses an out-of-range port without opening a connection", async () => {
    let dialled = false;

    const reach = await reachSsh("127.0.0.1", Number.NaN, {
      dial: () => {
        dialled = true;
        throw new Error("nothing should be dialled");
      },
    });

    expect(dialled).toBe(false);
    expect(reach.reached === false && reach.code).toBe("bad-port");
  });
});
