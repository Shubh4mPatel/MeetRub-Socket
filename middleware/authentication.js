// middlewares/socketAuth.js
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const socketAuth = (io) => {
  io.use((socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      const parsed = cookieHeader ? cookie.parse(cookieHeader) : {};
      const token = parsed.AccessToken;

      if (!token) return next(new Error('Authentication error'));
      const user = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = user; 
      next();
    } catch (err) {
      console.error('Socket Auth Error:', err.message);
      next(new Error('Authentication error'));
    }
  });
};

module.exports = { socketAuth };