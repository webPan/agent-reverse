# agent-reverse
agent 逆向分析

## 1. 安装 mitmproxy（推荐，免费）

```bash
pip install mitmproxy
# 会生成证书 ~/.mitmproxy/mitmproxy-ca-cert.pem
```

## 2. 启动代理(走代理)
```bash
mitmweb --mode upstream:http://127.0.0.1:7890
```