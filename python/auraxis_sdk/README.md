# auraxis-sdk (Python)

Python 客户端 SDK，通过 JSON-RPC 2.0（回环 TCP）驱动 Auraxis runtime
（）。

## 安装

```sh
cd python/auraxis_sdk
pip install -e .
```

## 用法

```python
from auraxis_sdk import create_client

with create_client() as client:
    print(client.ping())

    result = client.run_agent(
        prompt="修复登录 bug",
        description="SDK 任务",
        subagent_type="general-purpose",
        project_root="C:/my-project",
    )
    print(result)

    hits = client.search_sessions("登录", 5)
    print(hits)
```

`create_client()` 会以 `--sdk` 无头启动 Electron runtime，读取 stdout 上的
`AURAXIS_SDK_PORT=<port>` 后连接回环端口。可用环境变量：

- `AURAXIS_ELECTRON` — Electron 可执行文件路径
- `AURAXIS_MAIN_JS` — 主进程入口（默认 `dist-electron/main.js`）

## 测试

```sh
python -m unittest discover -s tests -t .
```
