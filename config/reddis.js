
const { createClient } = require("redis");

const redisClient = createClient({
  url: "redis://default:yourStrongPasswordHere@localhost:6379"
});

redisClient.on("error", (err) => console.error("Redis error:", err));

redisClient.connect().then(() => {
  console.log("✅ Connected to Redis");
});
module.exports = redisClient;