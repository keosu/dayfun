// 手机的传感器接口只在安全上下文（HTTPS）里可用，所以局域网服务也要提供 HTTPS。
// 优先使用 certs/ 里自备的证书（例如 mkcert 生成、手机已信任的），
// 否则自动生成一张包含本机所有局域网地址的自签名证书，放在 .certs/（已被 git 忽略）。

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import selfsigned from "selfsigned";

export function lanAddresses() {
  const list = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family === "IPv4" && !info.internal)
        list.push({ name, address: info.address });
    }
  }
  // 常见家庭/办公网段排前面，虚拟网卡（169.254、WSL、Docker）排后面
  const rank = (a) =>
    /^192\.168\./.test(a)
      ? 0
      : /^10\./.test(a)
        ? 1
        : /^172\.(1[6-9]|2\d|3[01])\./.test(a)
          ? 3
          : 4;
  return list.sort((a, b) => rank(a.address) - rank(b.address));
}

export async function loadOrCreateCert(root, addresses) {
  const custom = {
    cert: path.join(root, "certs", "cert.pem"),
    key: path.join(root, "certs", "key.pem"),
  };
  if (fs.existsSync(custom.cert) && fs.existsSync(custom.key)) {
    return {
      cert: fs.readFileSync(custom.cert),
      key: fs.readFileSync(custom.key),
      source: "自备证书（certs/）",
    };
  }

  const dir = path.join(root, ".certs");
  const certFile = path.join(dir, "cert.pem");
  const keyFile = path.join(dir, "key.pem");
  const metaFile = path.join(dir, "meta.json");
  const ips = ["127.0.0.1", ...addresses.map((a) => a.address)];

  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    const covers = ips.every((ip) => meta.ips.includes(ip));
    if (covers && Date.now() < meta.expires) {
      return {
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile),
        source: "自签名证书（已缓存）",
      };
    }
  } catch {
    // 没有缓存就重新生成
  }

  const days = 365;
  const notAfterDate = new Date(Date.now() + days * 86400000);
  const pems = await selfsigned.generate(
    [{ name: "commonName", value: "senselab.local" }],
    {
      algorithm: "sha256",
      keySize: 2048,
      notAfterDate,
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
        { name: "extKeyUsage", serverAuth: true },
        {
          name: "subjectAltName",
          altNames: [
            { type: 2, value: "localhost" },
            { type: 2, value: os.hostname() },
            ...ips.map((ip) => ({ type: 7, ip })),
          ],
        },
      ],
    },
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(certFile, pems.cert);
  fs.writeFileSync(keyFile, pems.private, { mode: 0o600 });
  fs.writeFileSync(
    metaFile,
    JSON.stringify({ ips, expires: notAfterDate.getTime() - 86400000 }),
  );
  return { cert: pems.cert, key: pems.private, source: "自签名证书（新生成）" };
}
