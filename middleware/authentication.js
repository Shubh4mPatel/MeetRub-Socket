// middlewares/socketAuth.js
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
// Middleware to refresh access token using refresh token
const refreshAccessToken = async (req, res, next) => {
  logger.info('Attempting to refresh access token...');
  try {
    const refreshToken = req.cookies?.RefreshToken;

    logger.info("refreshToken  ", refreshToken);
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    // Get user details
    const user = await query("SELECT * FROM users WHERE id = $1", [decoded.user_id]);
    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new access token
    const payload = {
      user_id: user.rows[0].id,
      email: user.rows[0].user_email,
      name: user.rows[0].user_name,
      role: user.rows[0].user_role
    };

    const newAccessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Set new access token cookie
    const ACCESS_TOKEN_DURATION = 15 * 60 * 1000; // 15 minutes
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('AccessToken', newAccessToken, {
      maxAge: ACCESS_TOKEN_DURATION,
      httpOnly: isProduction ? true : false,
      secure: isProduction, // ensure the cookie is sent over HTTPS in production
      sameSite: 'lax',     // required for cross-site cookies
      path: '/',
    });

    req.user = payload;
    req.headers[headerKey.authorization] = `Bearer ${newAccessToken}`;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token refresh failed' });
  }
};

const socketAuth = (io) => {
  io.use((socket, next) => {
    try {
      // console.log('reached here')
      // console.log("handshake headers:", socket.handshake.headers);
      // console.log("request headers:", socket.request?.headers);
      // console.log("conn headers:", socket.conn?.request?.headers);
      // const cookieHeader = socket.handshake.headers.cookie;
      // console.log(socket.handshake.headers.cookie)
      // const parsed = cookieHeader ? cookie.parse(cookieHeader) : {};
      console.log(socket.handshake.query.token)
      const token = socket.handshake.query.token
      // const token = parsed.AccessToken;
      if (token && token !== 'null' && token !== 'undefined' && token.trim() !== '') {
        try {
          req.user = jwt.verify(token, process.env.JWT_SECRET);
          socket.user = user;
          return next();
        } catch (error) {
          logger.info('Access token verification failed:', error.message);
          if (error.name === 'TokenExpiredError') {
            logger.info('Access token expired, attempting to refresh...');
            // Access token expired, try to refresh
            return refreshAccessToken(req, res, next);
          } else {
            return res.status(401).json({ error: 'Invalid access token' });
          }
        }
      } else {
        logger.info('No access token found, attempting to refresh...');
        // No access token, try to refresh
        return refreshAccessToken(req, res, next);
      }

    } catch (err) {
      console.error('Socket Auth Error:', err.message);
      next(new Error('Authentication error'));
    }
  });
};

module.exports = { socketAuth };




