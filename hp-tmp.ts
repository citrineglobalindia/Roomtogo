import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
const h = await hashPassword(process.argv[2]);
console.log(JSON.stringify({ uid: randomUUID(), aid: randomUUID(), h }));
