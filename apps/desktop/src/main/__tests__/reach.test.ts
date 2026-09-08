import { describe, expect, it } from "bun:test";
import { createServer, type Server, type Socket } from "node:net";
import { reachSsh } from "../reach";

/**
 * Knocking on an address. Real sockets on the loopback, because what is being
 * checked is exactly the behaviour of a socket: who speaks first, and what a
 * refusal looks like.
 */

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
  it("lit la bannière que le serveur annonce de lui-même", async () => {
    const reach = await against((socket) => {
      socket.write("SSH-2.0-OpenSSH_9.6p1 Ubuntu-3\r\n");
    });

    expect(reach.reached).toBe(true);
    expect(reach.reached && reach.software).toBe("OpenSSH_9.6p1");
    expect(reach.reached && reach.ms).toBeGreaterThanOrEqual(0);
  });

  it("n'écrit rien sur le serveur", async () => {
    let received = "";

    await against((socket) => {
      socket.on("data", (chunk) => {
        received += chunk.toString("utf8");
      });
      socket.write("SSH-2.0-OpenSSH_9.6p1\r\n");
    });

    expect(received).toBe("");
  });

  it("dit qu'une adresse qui parle autre chose n'est pas un serveur SSH", async () => {
    const reach = await against((socket) => {
      socket.write("HTTP/1.1 400 Bad Request\r\n");
    });

    expect(reach.reached).toBe(false);
    expect(reach.reached === false && reach.code).toBe("not-ssh");
    expect(reach.reached === false && reach.phrase.id).toBe(
      "refusal.reach.wrongPort"
    );
  });

  it("dit qu'une adresse muette n'a pas répondu à temps", async () => {
    const reach = await against(() => undefined, 60);

    expect(reach.reached === false && reach.code).toBe("timeout");
  });

  it("dit que rien n'écoute quand le port est fermé", async () => {
    const server = await listening(() => undefined);
    const port = portOf(server);

    await new Promise((done) => server.close(done));

    const reach = await reachSsh("127.0.0.1", port, { timeoutMs: 500 });

    expect(reach.reached).toBe(false);
    expect(reach.reached === false && reach.code).toBe("refused");
    expect(reach.reached === false && reach.phrase.values?.port).toBe(port);
  });

  it("refuse un port hors bornes sans ouvrir de connexion", async () => {
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
