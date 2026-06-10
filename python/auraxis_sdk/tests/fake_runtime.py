"""Fake Auraxis runtime for the Python SDK integration test."""

import json
import socket
import threading
import time


def main() -> None:
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", 0))
    srv.listen(8)
    port = srv.getsockname()[1]
    print(f"AURAXIS_SDK_PORT={port}", flush=True)

    def handle(conn: socket.socket) -> None:
        buf = b""
        try:
            while True:
                data = conn.recv(65536)
                if not data:
                    break
                buf += data
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    req = json.loads(line)
                    method = req["method"]
                    if method == "ping":
                        out = {"jsonrpc": "2.0", "id": req["id"], "result": {"pong": True, "time": 1}}
                    elif method == "agent.run":
                        params = req.get("params", {})
                        if not params.get("prompt"):
                            out = {
                                "jsonrpc": "2.0",
                                "id": req["id"],
                                "error": {"code": -32602, "message": "prompt 必填"},
                            }
                        else:
                            out = {
                                "jsonrpc": "2.0",
                                "id": req["id"],
                                "result": {"ran": params["prompt"], "description": params.get("description")},
                            }
                    elif method == "session.search":
                        out = {
                            "jsonrpc": "2.0",
                            "id": req["id"],
                            "result": {"query": req["params"]["query"], "count": 0, "results": []},
                        }
                    else:
                        out = {
                            "jsonrpc": "2.0",
                            "id": req["id"],
                            "error": {"code": -32601, "message": "unknown method"},
                        }
                    conn.sendall((json.dumps(out) + "\n").encode())
        except OSError:
            pass
        finally:
            try:
                conn.close()
            except OSError:
                pass

    def serve() -> None:
        while True:
            try:
                conn, _ = srv.accept()
            except OSError:
                break
            threading.Thread(target=handle, args=(conn,), daemon=True).start()

    threading.Thread(target=serve, daemon=True).start()
    while True:
        time.sleep(1)


if __name__ == "__main__":
    main()
