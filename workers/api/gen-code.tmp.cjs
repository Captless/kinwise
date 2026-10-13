const crypto = require("crypto");
const fs = require("fs");
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const group = () => Array.from(crypto.randomBytes(4)).map((b) => alphabet[b % alphabet.length]).join("");
const code = `${group()}-${group()}-${group()}`;
fs.writeFileSync(process.argv[2], code);
fs.writeFileSync(process.argv[3], crypto.createHash("sha256").update(code).digest("hex"));
console.log("code=" + code);
