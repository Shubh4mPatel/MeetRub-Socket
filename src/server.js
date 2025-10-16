const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
dotenv.config();
const socketConfig = require('../config/socketConfig');
const { logger } = require('../utils/logger');
const { manageLogFiles } = require('../cron/logmanager');
const { socketAuth } = require('../middleware/authentication');
const { startMasterWorker } = require('../consumers/worker');
const { chatController } = require('../controller/chat');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, socketConfig);


// Make io available to routes
app.set('io', io);
socketAuth(io);
chatController(io);


let serverWithSocket;
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || ''
if (process.env.NODE_ENV !== 'development') {
  serverWithSocket = server.listen(PORT, HOST, () => {
    manageLogFiles();
    startMasterWorker();

    // startCronJobs(io);
    logger.info(`Server running in ${process.env.NODE_ENV} mode on ${HOST}:${PORT}`);
  });
} else {
  serverWithSocket = server.listen(PORT, () => {
    startMasterWorker();
    manageLogFiles();
    // startCronJobs(io);
    logger.info(`Server running in ${process.env.NODE_ENV} mode on ${HOST}:${PORT}`);
  });
}

// Graceful shutdown (after server is defined)
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  //    stopCronJobs();
  serverWithSocket.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  serverWithSocket.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});