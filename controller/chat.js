const chatModel = require('../model/chatmodel');
const redis = require('../config/reddis');

// Store for online users
const onlineUsers = new Map(); // userId -> socketId

const chatController = (io) => {
  io.on('connection', async (socket) => {
    const userId = socket.user.userId;
    const username = socket.user.username;

    console.log(`User connected: ${username} (${userId})`);

    try {
      // Create or update user in database
      await chatModel.createOrGetUser(userId, username);

      // Store user's socket connection
      await redis.set(`user:${userId}:online`, "true", "EX", 3600);
      await redis.sadd("online_users", userId);

      // Emit online users list to this perticular client not done yet 
      io.emit('online-users', Array.from(onlineUsers.keys()));

      // Get unread count for this user
      const unreadCount = await chatModel.getUnreadCount(userId);
      socket.emit('unread-count', { count: unreadCount });

    } catch (error) {
      console.error('Error on connection:', error);
    }

    // Join a private chat room
    socket.on('join-chat', async ({ recipientId }) => {
      try {
        // Create a unique room ID (sorted to ensure same room for both users)
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        // Create or get chat room from database
        await chatModel.getOrCreateChatRoom(userId, recipientId);

        socket.join(chatRoomId);

        console.log(`${username} joined chat room: ${chatRoomId}`);

        // Get chat history
        const chatHistory = await chatModel.getChatHistory(chatRoomId);

        // Mark messages as read
        await chatModel.markMessagesAsRead(chatRoomId, userId);

        // Send chat history to the user
        socket.emit('chat-joined', {
          chatRoomId,
          recipientId,
          chatHistory
        });

        // Update unread count
        const unreadCount = await chatModel.getUnreadCount(userId);
        socket.emit('unread-count', { count: unreadCount });

      } catch (error) {
        console.error('Error joining chat:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });

    // Leave a chat room
    socket.on('leave-chat', ({ recipientId }) => {
      const [smallerId, largerId] = [userId, recipientId].sort();
      const chatRoomId = `${smallerId}-${largerId}`;

      socket.leave(chatRoomId);
      console.log(`${username} left chat room: ${chatRoomId}`);
    });

    // Send a message
    socket.on('send-message', async ({ recipientId, message }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        // Save message to database
        const savedMessage = await chatModel.saveMessage(
          chatRoomId,
          userId,
          recipientId,
          message
        );

        const messageData = {
          id: savedMessage.id,
          senderId: userId,
          senderUsername: username,
          recipientId,
          message,
          timestamp: savedMessage.created_at,
          chatRoomId,
          isRead: false
        };

        // Send message to the chat room (both users)
        io.to(chatRoomId).emit('receive-message', messageData);

        // If recipient is online, notify them
        if (onlineUsers.has(recipientId)) {
          const recipientSocketId = onlineUsers.get(recipientId);
          io.to(recipientSocketId).emit('new-message-notification', {
            senderId: userId,
            senderUsername: username,
            message
          });
        }

        console.log(`Message saved: ${username} to ${recipientId}`);

      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing', ({ recipientId, isTyping }) => {
      const [smallerId, largerId] = [userId, recipientId].sort();
      const chatRoomId = `${smallerId}-${largerId}`;

      socket.to(chatRoomId).emit('user-typing', {
        userId,
        username,
        isTyping
      });
    });

    // Get user's all chat rooms
    socket.on('get-chat-rooms', async () => {
      try {
        const chatRooms = await chatModel.getUserChatRooms(userId);
        socket.emit('chat-rooms-list', { chatRooms });
      } catch (error) {
        console.error('Error getting chat rooms:', error);
        socket.emit('error', { message: 'Failed to get chat rooms' });
      }
    });

    // Mark messages as read
    socket.on('mark-as-read', async ({ recipientId }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        await chatModel.markMessagesAsRead(chatRoomId, userId);

        const unreadCount = await chatModel.getUnreadCount(userId);
        socket.emit('unread-count', { count: unreadCount });

        // Notify sender that messages were read
        if (onlineUsers.has(recipientId)) {
          const recipientSocketId = onlineUsers.get(recipientId);
          io.to(recipientSocketId).emit('messages-read', {
            userId,
            chatRoomId
          });
        }
      } catch (error) {
        console.error('Error marking as read:', error);
      }
    });

    // Delete message
    socket.on('delete-message', async ({ messageId }) => {
      try {
        const deletedMessage = await chatModel.deleteMessage(messageId, userId);

        if (deletedMessage) {
          io.to(deletedMessage.room_id).emit('message-deleted', {
            messageId: deletedMessage.id,
            roomId: deletedMessage.room_id
          });
        }
      } catch (error) {
        console.error('Error deleting message:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Search messages
    socket.on('search-messages', async ({ searchTerm }) => {
      try {
        const results = await chatModel.searchMessages(userId, searchTerm);
        socket.emit('search-results', { results });
      } catch (error) {
        console.error('Error searching messages:', error);
        socket.emit('error', { message: 'Failed to search messages' });
      }
    });

    // Handle disconnect
    socket.on('disconnect',async () => {
      console.log(`User disconnected: ${username} (${userId})`);

      // Remove from online users
      await redis.del(`user:${userId}:online`);
      await redis.srem("online_users", userId);

      // Notify all clients about updated online users
      io.emit('online-users', Array.from(onlineUsers.keys()));
    });
  });
};

module.exports = { chatController };