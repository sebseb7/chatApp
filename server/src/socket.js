const { sendPushToUser } = require('./push');

module.exports = function (io, db) {
    // Map to track online users: userId -> { socketIds: Set, publicKey }
    // Using Set of socketIds to support multiple connections per user
    const onlineUsers = new Map();

    // Helper to check if targetUserId is visible to viewerUserId
    // Returns true if the viewer can see (and message) the target
    async function isUserVisibleTo(targetUserId, viewerUserId) {
        // Check if target user exists
        const targetUser = await db.get('SELECT id, isInvisible FROM users WHERE id = ?', targetUserId);
        if (!targetUser) {
            return false; // User doesn't exist
        }

        // Non-invisible users are visible to everyone
        if (!targetUser.isInvisible) {
            return true;
        }

        // Target is invisible - check if viewer is admin
        const viewer = await db.get('SELECT isAdmin FROM users WHERE id = ?', viewerUserId);
        if (viewer && viewer.isAdmin) {
            return true; // Admins can see everyone
        }

        // Check if they share a private group
        const sharedGroup = await db.get(`
            SELECT 1 FROM group_members gm1
            JOIN group_members gm2 ON gm1.groupId = gm2.groupId
            JOIN groups g ON gm1.groupId = g.id
            WHERE gm1.userId = ? AND gm2.userId = ? AND g.isPublic = 0
            LIMIT 1
        `, viewerUserId, targetUserId);
        if (sharedGroup) {
            return true;
        }

        // Check if they have DM history
        const dmHistory = await db.get(`
            SELECT 1 FROM messages 
            WHERE groupId = 0 AND (
                (senderId = ? AND receiverId = ?) OR 
                (senderId = ? AND receiverId = ?)
            )
            LIMIT 1
        `, viewerUserId, targetUserId, targetUserId, viewerUserId);
        if (dmHistory) {
            return true;
        }

        return false; // Invisible user not visible to this viewer
    }

    io.on('connection', async (socket) => {
        console.log('New socket connection:', socket.id);

        // Ping the client to keep the connection alive and verify "online" state
        const pingInterval = setInterval(() => {
            socket.emit('ping');
        }, 30000); // 30 seconds

        socket.on('disconnect', () => {
            clearInterval(pingInterval);
        });

        socket.on('join', async (userId) => {
            try {
                const user = await db.get('SELECT * FROM users WHERE id = ?', userId);
                if (user) {
                    socket.userId = userId;
                    
                    // Join a room named after the userId so all connections receive messages
                    socket.join(`user:${userId}`);
                    
                    // Track this socket for the user (support multiple connections)
                    const existingData = onlineUsers.get(userId);
                    if (existingData) {
                        existingData.socketIds.add(socket.id);
                    } else {
                        onlineUsers.set(userId, { socketIds: new Set([socket.id]), publicKey: null });
                    }

                    // Broadcast updated user list
                    await broadcastUserList();

                    // Send group list to the user who just joined
                    await broadcastGroupList(userId);

                    const displayName = user.customName || user.name;
                    console.log(`User ${displayName} (${userId}) joined.`);

                    // Find undelivered messages and mark them as delivered
                    const undeliveredDMs = await db.all(`
                        SELECT m.*, 
                               COALESCE(u.customName, u.name) as senderName, 
                               COALESCE(u.customAvatar, u.avatar) as senderAvatar
                        FROM messages m
                        JOIN users u ON m.senderId = u.id
                        WHERE m.receiverId = ? AND m.delivered = 0
                    `, userId);

                    for (const msg of undeliveredDMs) {
                        // Mark as delivered in DB
                        await db.run('UPDATE messages SET delivered = 1 WHERE id = ?', msg.id);
                        
                        // Notify sender if online (use room to reach all their connections)
                        if (onlineUsers.has(msg.senderId)) {
                            io.to(`user:${msg.senderId}`).emit('delivery_update', { messageId: msg.id, oderId: msg.receiverId });
                        }
                    }

                }
            } catch (err) {
                console.error('Error joining:', err);
            }
        });

        socket.on('update_public_key', async ({ publicKey }) => {
            console.log('update_public_key received, socket.userId:', socket.userId);
            if (!socket.userId) {
                console.log('update_public_key: no socket.userId');
                return;
            }
            const userData = onlineUsers.get(socket.userId);
            console.log('update_public_key: userData exists?', !!userData);
            if (userData) {
                // Only update if the key actually changed
                const newKeyJson = JSON.stringify(publicKey);
                const oldKeyJson = userData.publicKey ? JSON.stringify(userData.publicKey) : null;
                console.log('update_public_key: key changed?', newKeyJson !== oldKeyJson);
                if (newKeyJson === oldKeyJson) {
                    console.log('update_public_key: skipping (no change)');
                    return; // No change, skip to prevent loops
                }
                
                userData.publicKey = publicKey;
                onlineUsers.set(socket.userId, userData);
                // Persist to database so offline users' fingerprints are still viewable
                console.log('update_public_key: saving to DB for userId:', socket.userId);
                await db.run('UPDATE users SET publicKey = ? WHERE id = ?', newKeyJson, socket.userId);
                console.log('update_public_key: broadcasting user list');
                await broadcastUserList();
                console.log('update_public_key: done');
            }
        });

        socket.on('clear_public_key', async () => {
            console.log('clear_public_key received, socket.userId:', socket.userId);
            if (!socket.userId) {
                console.log('clear_public_key: no socket.userId');
                return;
            }
            const userData = onlineUsers.get(socket.userId);
            console.log('clear_public_key: userData exists?', !!userData);
            if (userData) {
                userData.publicKey = null;
                onlineUsers.set(socket.userId, userData);
                // Clear from database
                console.log('clear_public_key: clearing DB for userId:', socket.userId);
                await db.run('UPDATE users SET publicKey = NULL WHERE id = ?', socket.userId);
                console.log('clear_public_key: broadcasting user list');
                await broadcastUserList();
                console.log('clear_public_key: done');
            }
        });

        // Handle profile updates - refresh user list for all connected users
        socket.on('refresh_user_list', async () => {
            await broadcastUserList();
        });

        socket.on('delete_group', async ({ groupId }) => {
            if (!socket.userId) return;
            try {
                // Check if admin
                const user = await db.get('SELECT isAdmin FROM users WHERE id = ?', socket.userId);
                if (!user || !user.isAdmin) {
                    socket.emit('error', 'Only admins can delete groups');
                    return;
                }

                // Get members to notify them (refresh their list)
                const members = await db.all('SELECT userId FROM group_members WHERE groupId = ?', groupId);

                await db.run('DELETE FROM groups WHERE id = ?', groupId);
                await db.run('DELETE FROM group_members WHERE groupId = ?', groupId);
                // No messages to delete for groups (ephemeral)

                // Notify all members
                for (const member of members) {
                    await broadcastGroupList(member.userId);
                }

                // Also notify the admin (sender) if not in the list
                await broadcastGroupList(socket.userId);

            } catch (err) {
                console.error('Error deleting group:', err);
            }
        });

        socket.on('set_status', async ({ status }) => {
            if (!socket.userId) return;
            try {
                // Status: 0 = visible, 1 = invisible
                const isInvisible = status === 'invisible' ? 1 : 0;
                await db.run('UPDATE users SET isInvisible = ? WHERE id = ?', isInvisible, socket.userId);
                await broadcastUserList();
            } catch (err) {
                console.error('Error setting status:', err);
            }
        });

        socket.on('send_message', async ({ receiverId, groupId, content, type = 'text', senderPublicKey, receiverPublicKey, tempId }) => {
            if (!socket.userId) return;
            try {
                if (groupId) {
                    // Check if muted
                    const member = await db.get('SELECT isMuted FROM group_members WHERE groupId = ? AND userId = ?', groupId, socket.userId);
                    if (member && member.isMuted) {
                        socket.emit('error', 'You are muted in this group');
                        return;
                    }

                    // If private group, must be member
                    const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);
                    if (!group) return; // Group doesn't exist

                    if (!group.isPublic) {
                        const isMember = await db.get('SELECT 1 FROM group_members WHERE groupId = ? AND userId = ?', groupId, socket.userId);
                        if (!isMember) {
                            socket.emit('error', 'You are not a member of this group');
                            return;
                        }
                    }
                }

                const sender = await db.get('SELECT name, avatar, customName, customAvatar FROM users WHERE id = ?', socket.userId);
                const senderName = sender ? (sender.customName || sender.name) : 'Unknown';
                const senderAvatar = sender ? (sender.customAvatar || sender.avatar) : null;

                // Serialize senderPublicKey for storage
                const senderPublicKeyJson = senderPublicKey ? JSON.stringify(senderPublicKey) : null;

                if (groupId) {
                    // GROUP MESSAGE: Store in DB and broadcast to online users
                    const result = await db.run(
                        'INSERT INTO messages (senderId, receiverId, groupId, content, type, senderPublicKey, delivered) VALUES (?, ?, ?, ?, ?, ?, 1)',
                        socket.userId, 0, groupId, content, type, senderPublicKeyJson
                    );

                    const message = {
                        id: result.lastID,
                        senderId: socket.userId,
                        senderName,
                        senderAvatar,
                        receiverId: 0,
                        groupId,
                        content,
                        type,
                        timestamp: new Date().toISOString(),
                        senderPublicKey,
                        tempId
                    };

                    const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);

                    if (group && group.isPublic) {
                        // Broadcast to ALL online users (use rooms)
                        for (const [oderId] of onlineUsers) {
                            io.to(`user:${oderId}`).emit('receive_message', message);
                        }
                    } else {
                        // Broadcast to all group members (use rooms)
                        const members = await db.all('SELECT userId FROM group_members WHERE groupId = ?', groupId);
                        for (const member of members) {
                            if (onlineUsers.has(member.userId)) {
                                io.to(`user:${member.userId}`).emit('receive_message', message);
                            }
                        }
                    }
                } else {
                    // PRIVATE MESSAGE: Validate receiver is visible to sender
                    const canMessage = await isUserVisibleTo(receiverId, socket.userId);
                    if (!canMessage) {
                        socket.emit('error', 'Cannot send message to this user');
                        return;
                    }

                    const receiverData = onlineUsers.get(receiverId);
                    const isDelivered = !!receiverData;

                    // Check if this is the first DM between these users (for invisible user visibility)
                    const existingDM = await db.get(
                        'SELECT 1 FROM messages WHERE groupId = 0 AND ((senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)) LIMIT 1',
                        socket.userId, receiverId, receiverId, socket.userId
                    );
                    const isFirstDM = !existingDM;

                    // Also store receiver's public key so sender can decrypt their own sent messages in history
                    const receiverPublicKeyJson = receiverPublicKey ? JSON.stringify(receiverPublicKey) : null;
                    
                    const result = await db.run(
                        'INSERT INTO messages (senderId, receiverId, groupId, content, type, senderPublicKey, receiverPublicKey, delivered) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        socket.userId, receiverId || 0, 0, content, type, senderPublicKeyJson, receiverPublicKeyJson, isDelivered ? 1 : 0
                    );

                    const message = {
                        id: result.lastID,
                        senderId: socket.userId,
                        senderName,
                        senderAvatar,
                        receiverId,
                        groupId: 0,
                        content,
                        type,
                        timestamp: new Date().toISOString(),
                        senderPublicKey,
                        tempId,
                        delivered: isDelivered
                    };

                    if (receiverData) {
                        // Receiver is ONLINE (use room to reach all their connections)
                        io.to(`user:${receiverId}`).emit('receive_message', message);
                        io.to(`user:${socket.userId}`).emit('delivery_update', { messageId: message.id, oderId: receiverId });
                        io.to(`user:${socket.userId}`).emit('receive_message', { ...message, delivered: true });
                    } else {
                        // Receiver is OFFLINE (use room to reach all sender's connections)
                        io.to(`user:${socket.userId}`).emit('receive_message', { ...message, delivered: false });
                        
                        // Send push notification to offline user
                        const messagePreview = type === 'eee' 
                            ? '🔒 Encrypted message' 
                            : (content.length > 50 ? content.substring(0, 50) + '...' : content);
                        
                        sendPushToUser(db, receiverId, {
                            title: `New message from ${senderName}`,
                            body: messagePreview,
                            icon: senderAvatar || '/favicon.ico',
                            tag: `dm-${socket.userId}`,
                            data: {
                                type: 'dm',
                                senderId: socket.userId
                            }
                        });
                    }
                    
                    // If this is the first DM and sender is invisible, broadcast user list
                    // so the receiver can now see the invisible sender (they have DM history now)
                    if (isFirstDM && sender) {
                        const senderUser = await db.get('SELECT isInvisible FROM users WHERE id = ?', socket.userId);
                        if (senderUser && senderUser.isInvisible) {
                            await broadcastUserList();
                        }
                    }
                }

            } catch (err) {
                console.error('Error sending message:', err);
            }
        });

        // Load message history with pagination
        socket.on('load_history', async ({ oderId, groupId, beforeId, limit = 10 }) => {
            if (!socket.userId) return;
            try {
                let messages;
                
                if (groupId) {
                    // Group messages: load messages for the group
                    const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);
                    if (!group) return;
                    
                    // Check membership for private groups
                    if (!group.isPublic) {
                        const isMember = await db.get('SELECT 1 FROM group_members WHERE groupId = ? AND userId = ?', groupId, socket.userId);
                        const isAdmin = await db.get('SELECT isAdmin FROM users WHERE id = ?', socket.userId);
                        if (!isMember && (!isAdmin || !isAdmin.isAdmin)) return;
                    }
                    
                    if (beforeId) {
                        messages = await db.all(`
                            SELECT m.*, 
                                   COALESCE(u.customName, u.name) as senderName, 
                                   COALESCE(u.customAvatar, u.avatar) as senderAvatar
                            FROM messages m
                            LEFT JOIN users u ON m.senderId = u.id
                            WHERE m.groupId = ? AND m.id < ?
                            ORDER BY m.id DESC
                            LIMIT ?
                        `, groupId, beforeId, limit);
                    } else {
                        messages = await db.all(`
                            SELECT m.*, 
                                   COALESCE(u.customName, u.name) as senderName, 
                                   COALESCE(u.customAvatar, u.avatar) as senderAvatar
                            FROM messages m
                            LEFT JOIN users u ON m.senderId = u.id
                            WHERE m.groupId = ?
                            ORDER BY m.id DESC
                            LIMIT ?
                        `, groupId, limit);
                    }
                } else if (oderId) {
                    // P2P messages: load messages between current user and other user
                    if (beforeId) {
                        messages = await db.all(`
                            SELECT m.*, 
                                   COALESCE(u.customName, u.name) as senderName, 
                                   COALESCE(u.customAvatar, u.avatar) as senderAvatar
                            FROM messages m
                            LEFT JOIN users u ON m.senderId = u.id
                            WHERE ((m.senderId = ? AND m.receiverId = ?) OR (m.senderId = ? AND m.receiverId = ?))
                              AND m.groupId = 0 AND m.id < ?
                            ORDER BY m.id DESC
                            LIMIT ?
                        `, socket.userId, oderId, oderId, socket.userId, beforeId, limit);
                    } else {
                        messages = await db.all(`
                            SELECT m.*, 
                                   COALESCE(u.customName, u.name) as senderName, 
                                   COALESCE(u.customAvatar, u.avatar) as senderAvatar
                            FROM messages m
                            LEFT JOIN users u ON m.senderId = u.id
                            WHERE ((m.senderId = ? AND m.receiverId = ?) OR (m.senderId = ? AND m.receiverId = ?))
                              AND m.groupId = 0
                            ORDER BY m.id DESC
                            LIMIT ?
                        `, socket.userId, oderId, oderId, socket.userId, limit);
                    }
                }
                
                if (messages) {
                    // Parse public key JSON and reverse to chronological order
                    const parsedMessages = messages.map(m => ({
                        ...m,
                        senderPublicKey: m.senderPublicKey ? JSON.parse(m.senderPublicKey) : null,
                        receiverPublicKey: m.receiverPublicKey ? JSON.parse(m.receiverPublicKey) : null
                    })).reverse();
                    
                    const hasMore = messages.length === limit;
                    socket.emit('history_loaded', { 
                        messages: parsedMessages, 
                        oderId, 
                        groupId,
                        hasMore 
                    });
                }
            } catch (err) {
                console.error('Error loading history:', err);
            }
        });

        // Delete a single message
        socket.on('delete_message', async ({ messageId }) => {
            if (!socket.userId) return;
            try {
                const message = await db.get('SELECT * FROM messages WHERE id = ?', messageId);
                if (!message) return;
                
                // Check permission: sender can always delete, receiver can delete in P2P
                const canDelete = message.senderId === socket.userId || 
                    (message.groupId === 0 && message.receiverId === socket.userId);
                
                if (!canDelete) {
                    socket.emit('error', 'You can only delete your own messages');
                    return;
                }
                
                await db.run('DELETE FROM messages WHERE id = ?', messageId);
                
                // Notify relevant users about deletion
                if (message.groupId) {
                    const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', message.groupId);
                    if (group && group.isPublic) {
                        for (const [oderId] of onlineUsers) {
                            io.to(`user:${oderId}`).emit('message_deleted', { messageId, groupId: message.groupId });
                        }
                    } else {
                        const members = await db.all('SELECT userId FROM group_members WHERE groupId = ?', message.groupId);
                        for (const member of members) {
                            if (onlineUsers.has(member.userId)) {
                                io.to(`user:${member.userId}`).emit('message_deleted', { messageId, groupId: message.groupId });
                            }
                        }
                    }
                } else {
                    // P2P: notify both sender and receiver (use rooms)
                    const otherUserId = message.senderId === socket.userId ? message.receiverId : message.senderId;
                    if (onlineUsers.has(message.senderId)) io.to(`user:${message.senderId}`).emit('message_deleted', { messageId, oderId: otherUserId });
                    if (onlineUsers.has(message.receiverId)) io.to(`user:${message.receiverId}`).emit('message_deleted', { messageId, oderId: otherUserId });
                }
            } catch (err) {
                console.error('Error deleting message:', err);
            }
        });

        // Delete all messages in a chat
        socket.on('delete_all_messages', async ({ oderId, groupId }) => {
            if (!socket.userId) return;
            try {
                if (groupId) {
                    // Group: can only delete own messages
                    await db.run('DELETE FROM messages WHERE groupId = ? AND senderId = ?', groupId, socket.userId);
                    
                    // Notify group members (use rooms)
                    const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);
                    if (group && group.isPublic) {
                        for (const [oderId] of onlineUsers) {
                            io.to(`user:${oderId}`).emit('messages_deleted_bulk', { groupId, oderId: socket.userId });
                        }
                    } else {
                        const members = await db.all('SELECT userId FROM group_members WHERE groupId = ?', groupId);
                        for (const member of members) {
                            if (onlineUsers.has(member.userId)) {
                                io.to(`user:${member.userId}`).emit('messages_deleted_bulk', { groupId, oderId: socket.userId });
                            }
                        }
                    }
                } else if (oderId) {
                    // P2P: both users can delete all messages in the conversation
                    await db.run(`
                        DELETE FROM messages 
                        WHERE groupId = 0 AND (
                            (senderId = ? AND receiverId = ?) OR 
                            (senderId = ? AND receiverId = ?)
                        )
                    `, socket.userId, oderId, oderId, socket.userId);
                    
                    // Notify both users (use rooms)
                    if (onlineUsers.has(socket.userId)) io.to(`user:${socket.userId}`).emit('messages_deleted_bulk', { oderId });
                    if (onlineUsers.has(oderId)) io.to(`user:${oderId}`).emit('messages_deleted_bulk', { oderId: socket.userId });
                }
            } catch (err) {
                console.error('Error deleting all messages:', err);
            }
        });

        socket.on('disconnect', async () => {
            if (socket.userId) {
                const userData = onlineUsers.get(socket.userId);
                if (userData) {
                    userData.socketIds.delete(socket.id);
                    // Only remove user from onlineUsers if all their connections are gone
                    if (userData.socketIds.size === 0) {
                onlineUsers.delete(socket.userId);
                await broadcastUserList();
                        console.log(`User ${socket.userId} disconnected (all connections closed).`);
                    } else {
                        console.log(`User ${socket.userId} closed one connection (${userData.socketIds.size} remaining).`);
                    }
                }
            }
        });

        socket.on('create_group', async ({ name, isPublic }) => {
            if (!socket.userId) return;
            try {
                const userRaw = await db.get('SELECT isAdmin, name, customName FROM users WHERE id = ?', socket.userId);
                const user = userRaw ? { ...userRaw, name: userRaw.customName || userRaw.name } : null;

                if (isPublic && (!user || !user.isAdmin)) {
                    socket.emit('error', 'Only admins can create public groups');
                    return;
                }

                const result = await db.run(
                    'INSERT INTO groups (name, isPublic) VALUES (?, ?)',
                    name,
                    isPublic ? 1 : 0
                );
                const groupId = result.lastID;

                if (!isPublic) {
                    await db.run('INSERT INTO group_members (groupId, userId) VALUES (?, ?)', groupId, socket.userId);
                }

                if (isPublic) {
                    const allUsers = await db.all('SELECT id FROM users');
                    for (const u of allUsers) {
                        await broadcastGroupList(u.id);
                    }
                } else {
                    await broadcastGroupList(socket.userId);
                }

                const systemMsg = `${user.name} created group "${name}"`;
                await sendSystemMessage(groupId, systemMsg);

            } catch (err) {
                console.error('Error creating group:', err);
            }
        });

        socket.on('add_to_group', async ({ groupId, userId }) => {
            if (!socket.userId) return;
            try {
                const adminRaw = await db.get('SELECT isAdmin, name, customName FROM users WHERE id = ?', socket.userId);
                const admin = adminRaw ? { ...adminRaw, name: adminRaw.customName || adminRaw.name } : null;
                const isMember = await db.get('SELECT * FROM group_members WHERE groupId = ? AND userId = ?', groupId, socket.userId);

                if ((!admin || !admin.isAdmin) && !isMember) {
                    socket.emit('error', 'Only members or admins can add to groups');
                    return;
                }

                const targetUserRaw = await db.get('SELECT isInvisible, name, customName FROM users WHERE id = ?', userId);
                const targetUser = targetUserRaw ? { ...targetUserRaw, name: targetUserRaw.customName || targetUserRaw.name } : null;
                if (targetUser && targetUser.isInvisible === 1) {
                    if (!admin || !admin.isAdmin) {
                        socket.emit('error', 'Only admins can add invisible users to groups');
                        return;
                    }
                }

                const existing = await db.get('SELECT * FROM group_members WHERE groupId = ? AND userId = ?', groupId, userId);
                if (existing) {
                    socket.emit('error', 'User is already in the group');
                    return;
                }

                await db.run('INSERT INTO group_members (groupId, userId) VALUES (?, ?)', groupId, userId);

                const addedUserData = onlineUsers.get(userId);
                if (addedUserData) {
                    await broadcastGroupList(userId);
                    await broadcastUserList();
                }

                await broadcastGroupList(socket.userId);

                const addedUserRaw = await db.get('SELECT name, customName FROM users WHERE id = ?', userId);
                const addedUserName = addedUserRaw.customName || addedUserRaw.name;
                const systemMsg = `${admin.name} added ${addedUserName}`;
                await sendSystemMessage(groupId, systemMsg);

                await broadcastGroupMembers(groupId);

            } catch (err) {
                console.error('Error adding to group:', err);
            }
        });

        socket.on('toggle_mute', async ({ groupId, userId }) => {
            if (!socket.userId) return;
            try {
                const adminRaw = await db.get('SELECT isAdmin, name, customName FROM users WHERE id = ?', socket.userId);
                const admin = adminRaw ? { ...adminRaw, name: adminRaw.customName || adminRaw.name } : null;
                if (!admin || !admin.isAdmin) {
                    socket.emit('error', 'Only admins can mute/unmute');
                    return;
                }

                let member = await db.get('SELECT isMuted FROM group_members WHERE groupId = ? AND userId = ?', groupId, userId);

                if (!member) {
                    const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);
                    if (group && group.isPublic) {
                        await db.run('INSERT INTO group_members (groupId, userId, isMuted) VALUES (?, ?, 1)', groupId, userId);
                        member = { isMuted: 1 };
                    } else {
                        return;
                    }
                } else {
                    const newMuted = member.isMuted ? 0 : 1;
                    await db.run('UPDATE group_members SET isMuted = ? WHERE groupId = ? AND userId = ?', newMuted, groupId, userId);
                }

                const targetUserRaw = await db.get('SELECT name, customName FROM users WHERE id = ?', userId);
                const targetUserName = targetUserRaw.customName || targetUserRaw.name;
                const updatedMember = await db.get('SELECT isMuted FROM group_members WHERE groupId = ? AND userId = ?', groupId, userId);
                const action = updatedMember.isMuted ? 'muted' : 'unmuted';

                const systemMsg = `${admin.name} ${action} ${targetUserName}`;
                await sendSystemMessage(groupId, systemMsg);

                await broadcastGroupMembers(groupId);

            } catch (err) {
                console.error('Error toggling mute:', err);
            }
        });

        socket.on('remove_from_group', async ({ groupId, userId }) => {
            if (!socket.userId) return;
            try {
                const adminRaw = await db.get('SELECT isAdmin, name, customName FROM users WHERE id = ?', socket.userId);
                const admin = adminRaw ? { ...adminRaw, name: adminRaw.customName || adminRaw.name } : null;
                if (!admin || !admin.isAdmin) {
                    socket.emit('error', 'Only admins can remove from groups');
                    return;
                }

                await db.run('DELETE FROM group_members WHERE groupId = ? AND userId = ?', groupId, userId);

                await broadcastGroupList(userId);

                const removedUserRaw = await db.get('SELECT name, customName FROM users WHERE id = ?', userId);
                const removedUserName = removedUserRaw.customName || removedUserRaw.name;
                const systemMsg = `${admin.name} removed ${removedUserName}`;
                await sendSystemMessage(groupId, systemMsg);

                await broadcastGroupMembers(groupId);

            } catch (err) {
                console.error('Error removing from group:', err);
            }
        });

        socket.on('get_group_members', async ({ groupId }) => {
            if (!socket.userId) return;

            const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);
            const isAdmin = await db.get('SELECT isAdmin FROM users WHERE id = ?', socket.userId);

            if (group && group.isPublic && (!isAdmin || !isAdmin.isAdmin)) {
                socket.emit('group_members', { groupId, members: [] });
                return;
            }

            const isMember = await db.get('SELECT * FROM group_members WHERE groupId = ? AND userId = ?', groupId, socket.userId);

            if (isMember || (isAdmin && isAdmin.isAdmin) || (group && group.isPublic)) {
                const query = `
                    SELECT u.id, 
                           COALESCE(u.customName, u.name) as name, 
                           COALESCE(u.customAvatar, u.avatar) as avatar, 
                           gm.isMuted 
                    FROM users u 
                    JOIN group_members gm ON u.id = gm.userId 
                    WHERE gm.groupId = ?
                 `;

                const members = await db.all(query, groupId);
                socket.emit('group_members', { groupId, members });
            }
        });

        async function sendSystemMessage(groupId, content) {
            // System messages are also ephemeral now?
            // Or should they be stored?
            // "current message table... should only hold messages that are undelivered private messages. no group messages at all."
            // So system messages in groups are also ephemeral.

            const message = {
                id: Date.now(),
                senderId: 0,
                receiverId: 0,
                groupId,
                content,
                type: 'system',
                timestamp: new Date().toISOString()
            };

            const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);

            if (group && group.isPublic) {
                for (const [oderId] of onlineUsers) {
                    io.to(`user:${oderId}`).emit('receive_message', message);
                }
            } else {
                const members = await db.all('SELECT userId FROM group_members WHERE groupId = ?', groupId);
                for (const member of members) {
                    if (onlineUsers.has(member.userId)) {
                        io.to(`user:${member.userId}`).emit('receive_message', message);
                    }
                }
            }
        }

        async function broadcastGroupMembers(groupId) {
            const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);

            const members = await db.all(`
                SELECT u.id, 
                       COALESCE(u.customName, u.name) as name, 
                       COALESCE(u.customAvatar, u.avatar) as avatar, 
                       gm.isMuted 
                FROM users u 
                JOIN group_members gm ON u.id = gm.userId 
                WHERE gm.groupId = ?
             `, groupId);

            if (group && group.isPublic) {
                for (const [oderId] of onlineUsers) {
                    const user = await db.get('SELECT isAdmin FROM users WHERE id = ?', oderId);
                    if (user && user.isAdmin) {
                        io.to(`user:${oderId}`).emit('group_members', { groupId, members });
                    } else {
                        io.to(`user:${oderId}`).emit('group_members', { groupId, members: [] });
                    }
                }
            } else {
                const memberIds = members.map(m => m.id);
                for (const memberId of memberIds) {
                    if (onlineUsers.has(memberId)) {
                        io.to(`user:${memberId}`).emit('group_members', { groupId, members });
                    }
                }
            }
        }

        socket.on('leave_group', async ({ groupId }) => {
            if (!socket.userId) return;
            try {
                const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);
                if (group && group.isPublic) {
                    socket.emit('error', 'Cannot leave public groups');
                    return;
                }

                await db.run('DELETE FROM group_members WHERE groupId = ? AND userId = ?', groupId, socket.userId);

                await broadcastGroupList(socket.userId);

                const userRaw = await db.get('SELECT name, customName FROM users WHERE id = ?', socket.userId);
                const userName = userRaw.customName || userRaw.name;
                const systemMsg = `${userName} left the group`;
                await sendSystemMessage(groupId, systemMsg);

                await broadcastGroupMembers(groupId);

            } catch (err) {
                console.error('Error leaving group:', err);
            }
        });

        socket.on('get_groups', async () => {
            if (!socket.userId) return;
            await broadcastGroupList(socket.userId);
        });

        socket.on('mark_read', async ({ messageId, groupId, senderId }) => {
            if (!socket.userId) return;
            try {
                // We don't store read receipts anymore. Just broadcast.

                const readerRaw = await db.get('SELECT id, name, avatar, customName, customAvatar, isInvisible FROM users WHERE id = ?', socket.userId);
                const reader = {
                    id: readerRaw.id,
                    name: readerRaw.customName || readerRaw.name,
                    avatar: readerRaw.customAvatar || readerRaw.avatar,
                    isInvisible: readerRaw.isInvisible
                };

                let shouldBroadcast = true;

                if (reader.isInvisible) {
                    if (groupId) {
                        const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);
                        if (group && group.isPublic) {
                            shouldBroadcast = false;
                        } else {
                            shouldBroadcast = true;
                        }
                    } else {
                        shouldBroadcast = true;
                    }
                }

                if (shouldBroadcast) {
                    const readUpdate = {
                        messageId,
                        user: {
                            id: reader.id,
                            name: reader.name,
                            avatar: reader.avatar
                        }
                    };

                    if (groupId) {
                        const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);
                        if (group && group.isPublic) {
                            for (const [uid] of onlineUsers) {
                                io.to(`user:${uid}`).emit('message_read_update', readUpdate);
                            }
                        } else {
                            const members = await db.all('SELECT userId FROM group_members WHERE groupId = ?', groupId);
                            for (const member of members) {
                                if (onlineUsers.has(member.userId)) io.to(`user:${member.userId}`).emit('message_read_update', readUpdate);
                            }
                        }
                    } else {
                        io.to(`user:${socket.userId}`).emit('message_read_update', readUpdate);

                        if (senderId && onlineUsers.has(senderId)) {
                            io.to(`user:${senderId}`).emit('message_read_update', readUpdate);
                        }
                    }
                }

            } catch (err) {
                console.error('Error marking read:', err);
            }
        });

        async function broadcastGroupList(targetUserId) {
            if (!onlineUsers.has(targetUserId)) return;

            const groups = await db.all(`
            SELECT DISTINCT g.id, g.name, g.isPublic
            FROM groups g
            LEFT JOIN group_members gm ON g.id = gm.groupId
            WHERE g.isPublic = 1 OR gm.userId = ?
        `, targetUserId);

            io.to(`user:${targetUserId}`).emit('group_list', groups);
        }

        async function broadcastUserList() {
            try {
                const users = await db.all('SELECT id, name, avatar, customName, customAvatar, isInvisible, isAdmin, publicKey FROM users');
                const adminIds = new Set(users.filter(u => u.isAdmin).map(u => u.id));

                for (const [oderId] of onlineUsers) {
                    const visibleUsers = [];
                    const isViewerAdmin = adminIds.has(oderId);

                    let sharedPrivateGroupUserIds = new Set();
                    let dmHistoryUserIds = new Set();
                    
                    if (!isViewerAdmin) {
                        // Get users from shared private groups
                        const myPrivateGroups = await db.all(`
                            SELECT gm.groupId 
                            FROM group_members gm
                            JOIN groups g ON gm.groupId = g.id
                            WHERE gm.userId = ? AND g.isPublic = 0
                        `, oderId);

                        const myPrivateGroupIds = myPrivateGroups.map(g => g.groupId);

                        if (myPrivateGroupIds.length > 0) {
                            const sharedMembers = await db.all(`
                                SELECT userId 
                                FROM group_members 
                                WHERE groupId IN (${myPrivateGroupIds.join(',')})
                            `);
                            sharedMembers.forEach(m => sharedPrivateGroupUserIds.add(m.userId));
                        }
                        
                        // Get users with DM history (so invisible users who messaged me stay visible)
                        const dmPartners = await db.all(`
                            SELECT DISTINCT 
                                CASE WHEN senderId = ? THEN receiverId ELSE senderId END as oderId
                            FROM messages 
                            WHERE groupId = 0 AND (senderId = ? OR receiverId = ?)
                        `, oderId, oderId, oderId);
                        dmPartners.forEach(p => dmHistoryUserIds.add(p.oderId));
                    }

                    for (const otherUser of users) {
                        // Attach public key if available (prefer live key from online user, fall back to stored key)
                        const otherUserOnlineData = onlineUsers.get(otherUser.id);
                        let publicKey = otherUserOnlineData ? otherUserOnlineData.publicKey : null;
                        // For offline users, use the stored publicKey from DB
                        if (!publicKey && otherUser.publicKey) {
                            try {
                                publicKey = JSON.parse(otherUser.publicKey);
                            } catch (e) {
                                publicKey = null;
                            }
                        }

                        // Use custom name/avatar if set, otherwise use Google data
                        const effectiveName = otherUser.customName || otherUser.name;
                        const effectiveAvatar = otherUser.customAvatar || otherUser.avatar;
                        
                        // Include both effective and Google data so client can show reset option
                        const userWithKey = {
                            ...otherUser,
                            name: effectiveName,
                            avatar: effectiveAvatar,
                            googleName: otherUser.name,
                            googleAvatar: otherUser.avatar,
                            hasCustomProfile: !!(otherUser.customName || otherUser.customAvatar),
                            publicKey
                        };

                        if (otherUser.id === oderId) {
                            visibleUsers.push({ ...userWithKey, status: 'online' });
                            continue;
                        }

                        const isOtherOnline = !!otherUserOnlineData;
                        let status = isOtherOnline ? 'online' : 'offline';

                        if (otherUser.isInvisible) {
                            if (isViewerAdmin) {
                                if (isOtherOnline) status = 'invisible';
                                visibleUsers.push({ ...userWithKey, status });
                            } else if (sharedPrivateGroupUserIds.has(otherUser.id) || dmHistoryUserIds.has(otherUser.id)) {
                                // Show if shared private group OR has DM history
                                visibleUsers.push({ ...userWithKey, status });
                            } else {
                                continue;
                            }
                        } else {
                            visibleUsers.push({ ...userWithKey, status });
                        }
                    }

                    io.to(`user:${oderId}`).emit('user_list', visibleUsers);
                }

            } catch (err) {
                console.error('Error broadcasting user list:', err);
            }
        }
    });
};
