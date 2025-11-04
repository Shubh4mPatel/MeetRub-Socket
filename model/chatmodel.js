const pool = require('../config/dbConfig');

const chatModel = {
  // Create or get user
  async createOrGetUser(userId, username) {
    const query = `
      INSERT INTO users (user_id, username, last_seen)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        username = EXCLUDED.username,
        last_seen = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [userId, username]);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating/updating user:', error);
      throw error;
    }
  },

  // Get or create chat room
  async getOrCreateChatRoom(user1Id, user2Id) {
    // Ensure user1Id is always less than user2Id for consistency
    const [smallerId, largerId] = [user1Id, user2Id].sort();
    const roomId = `${smallerId}-${largerId}`;

    const query = `
      INSERT INTO chat_rooms (room_id, user1_id, user2_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (room_id) 
      DO UPDATE SET room_id = EXCLUDED.room_id
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [roomId, smallerId, largerId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating/getting chat room:', error);
      throw error;
    }
  },

  // Save message
  async saveMessage(roomId, senderId, recipientId, message) {
    const query = `
      INSERT INTO messages (room_id, sender_id, recipient_id, message, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [roomId, senderId, recipientId, message]);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving message:', error);
      throw error;
    }
  },

  // Get chat history
  async getChatHistory(roomId, limit = 50, offset = 0) {
    const query = `
      SELECT 
        m.id,
        m.room_id,
        m.sender_id,
        m.recipient_id,
        m.message,
        m.is_read,
        m.created_at,
        u.username as sender_username
      FROM messages m
      JOIN users u ON m.sender_id = u.user_id
      WHERE m.room_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    try {
      const result = await pool.query(query, [roomId, limit, offset]);
      return result.rows.reverse(); // Reverse to show oldest first
    } catch (error) {
      console.error('Error getting chat history:', error);
      throw error;
    }
  },

  // Get user's all chat rooms with last message
  async getUserChatRooms(userId) {
    const query = `
      SELECT 
        cr.room_id,
        cr.user1_id,
        cr.user2_id,
        cr.created_at as room_created_at,
        u1.username as user1_username,
        u2.username as user2_username,
        m.message as last_message,
        m.created_at as last_message_time,
        m.sender_id as last_message_sender
      FROM chat_rooms cr
      LEFT JOIN users u1 ON cr.user1_id = u1.user_id
      LEFT JOIN users u2 ON cr.user2_id = u2.user_id
      LEFT JOIN LATERAL (
        SELECT message, created_at, sender_id
        FROM messages
        WHERE room_id = cr.room_id
        ORDER BY created_at DESC
        LIMIT 1
      ) m ON true
      WHERE cr.user1_id = $1 OR cr.user2_id = $1
      ORDER BY m.created_at DESC NULLS LAST
    `;

    try {
      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error('Error getting user chat rooms:', error);
      throw error;
    }
  },

  // Mark messages as read
  async markMessagesAsRead(roomId, userId) {
    const query = `
      UPDATE messages
      SET is_read = TRUE
      WHERE room_id = $1 
        AND recipient_id = $2 
        AND is_read = FALSE
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [roomId, userId]);
      return result.rows;
    } catch (error) {
      console.error('Error marking messages as read:', error);
      throw error;
    }
  },

  // Get unread message count
  async getUnreadCount(userId) {
    const query = `
      SELECT COUNT(*) as unread_count
      FROM messages
      WHERE recipient_id = $1 AND is_read = FALSE
    `;

    try {
      const result = await pool.query(query, [userId]);
      return parseInt(result.rows[0].unread_count);
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  },

  // Delete a message
  async deleteMessage(messageId, userId) {
    const query = `
      DELETE FROM messages
      WHERE id = $1 AND sender_id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [messageId, userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  },

  // Search messages
  async searchMessages(userId, searchTerm) {
    const query = `
      SELECT 
        m.id,
        m.room_id,
        m.sender_id,
        m.recipient_id,
        m.message,
        m.created_at,
        u.username as sender_username
      FROM messages m
      JOIN users u ON m.sender_id = u.user_id
      JOIN chat_rooms cr ON m.room_id = cr.room_id
      WHERE (cr.user1_id = $1 OR cr.user2_id = $1)
        AND m.message ILIKE $2
      ORDER BY m.created_at DESC
      LIMIT 50
    `;

    try {
      const result = await pool.query(query, [userId, `%${searchTerm}%`]);
      return result.rows;
    } catch (error) {
      console.error('Error searching messages:', error);
      throw error;
    }
  }
};

module.exports = chatModel;