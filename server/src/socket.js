module.exports = function (io, db) {
    // Map to track online users: userId -> { socketId, publicKey }
    const onlineUsers = new Map();

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
                    // Initialize with no public key, wait for update_public_key
                    onlineUsers.set(userId, { socketId: socket.id, publicKey: null });

                    // Broadcast updated user list
                    await broadcastUserList();

                    // Send group list to the user who just joined
                    await broadcastGroupList(userId);

                    console.log(`User ${user.name} (${userId}) joined.`);

                    // Fetch missed messages (Only Private Messages now)
                    // Logic: Find messages where I am the receiver AND messageId NOT IN message_deliveries
                    // Actually, we DELETE delivered messages now. So just fetch ALL messages for me.

                    const missedDMs = await db.all(`
                        SELECT m.*, u.name as senderName, u.avatar as senderAvatar
                        FROM messages m
                        JOIN users u ON m.senderId = u.id
                        WHERE m.receiverId = ? 
                    `, userId);

                    // Sort by timestamp
                    const allMissed = missedDMs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

                    for (const msg of allMissed) {
                        socket.emit('receive_message', msg);

                        // Mark as delivered and DELETE from DB
                        // We don't need message_deliveries table anymore for persistence if we delete.
                        // But we might want to notify sender?
                        // If sender is online, notify.

                        const senderData = onlineUsers.get(msg.senderId);
                        if (senderData) {
                            io.to(senderData.socketId).emit('delivery_update', { messageId: msg.id, userId });
                        }

                        // DELETE message
                        await db.run('DELETE FROM messages WHERE id = ?', msg.id);
                    }

                }
            } catch (err) {
                console.error('Error joining:', err);
            }
        });

        socket.on('update_public_key', async ({ publicKey }) => {
            if (!socket.userId) return;
            const userData = onlineUsers.get(socket.userId);
            if (userData) {
                userData.publicKey = publicKey;
                onlineUsers.set(socket.userId, userData);
                await broadcastUserList();
            }
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

        socket.on('send_message', async ({ receiverId, groupId, content, type = 'text', senderPublicKey }) => {
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

                const sender = await db.get('SELECT name, avatar FROM users WHERE id = ?', socket.userId);

                // Construct message object
                // Note: We do NOT insert into DB yet.
                const message = {
                    id: Date.now(), // Temporary ID for ephemeral/RAM
                    senderId: socket.userId,
                    senderName: sender ? sender.name : 'Unknown',
                    senderAvatar: sender ? sender.avatar : null,
                    receiverId,
                    groupId,
                    content,
                    type,
                    timestamp: new Date().toISOString(),
                    senderPublicKey // Pass through the key
                };

                if (groupId) {
                    // GROUP MESSAGE: Ephemeral, broadcast to online only.
                    const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);

                    if (group && group.isPublic) {
                        // Broadcast to ALL online users
                        for (const [userId, userData] of onlineUsers) {
                            io.to(userData.socketId).emit('receive_message', message);
                        }
                    } else {
                        // Broadcast to all group members
                        const members = await db.all('SELECT userId FROM group_members WHERE groupId = ?', groupId);
                        for (const member of members) {
                            const userData = onlineUsers.get(member.userId);
                            if (userData) {
                                io.to(userData.socketId).emit('receive_message', message);
                            }
                        }
                    }
                } else {
                    // PRIVATE MESSAGE
                    const receiverData = onlineUsers.get(receiverId);

                    if (receiverData) {
                        // Receiver is ONLINE
                        // Emit directly
                        io.to(receiverData.socketId).emit('receive_message', message);

                        // Notify sender of delivery
                        socket.emit('delivery_update', { messageId: message.id, userId: receiverId });

                        // Echo back to sender (with delivered=true)
                        socket.emit('receive_message', { ...message, delivered: true });
                    } else {
                        // Receiver is OFFLINE
                        // Insert into DB
                        const result = await db.run(
                            'INSERT INTO messages (senderId, receiverId, groupId, content, type) VALUES (?, ?, ?, ?, ?)',
                            socket.userId, receiverId || 0, groupId || 0, content, type
                        );

                        // Update ID to real DB ID
                        message.id = result.lastID;

                        // Echo back to sender (with delivered=false)
                        socket.emit('receive_message', { ...message, delivered: false });
                    }
                }

            } catch (err) {
                console.error('Error sending message:', err);
            }
        });

        socket.on('disconnect', async () => {
            if (socket.userId) {
                onlineUsers.delete(socket.userId);
                await broadcastUserList();
                console.log(`User ${socket.userId} disconnected.`);
            }
        });

        socket.on('create_group', async ({ name, isPublic }) => {
            if (!socket.userId) return;
            try {
                const user = await db.get('SELECT isAdmin, name FROM users WHERE id = ?', socket.userId);

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
                const admin = await db.get('SELECT isAdmin, name FROM users WHERE id = ?', socket.userId);
                const isMember = await db.get('SELECT * FROM group_members WHERE groupId = ? AND userId = ?', groupId, socket.userId);

                if ((!admin || !admin.isAdmin) && !isMember) {
                    socket.emit('error', 'Only members or admins can add to groups');
                    return;
                }

                const targetUser = await db.get('SELECT isInvisible, name FROM users WHERE id = ?', userId);
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

                const addedUser = await db.get('SELECT name FROM users WHERE id = ?', userId);
                const systemMsg = `${admin.name} added ${addedUser.name}`;
                await sendSystemMessage(groupId, systemMsg);

                await broadcastGroupMembers(groupId);

            } catch (err) {
                console.error('Error adding to group:', err);
            }
        });

        socket.on('toggle_mute', async ({ groupId, userId }) => {
            if (!socket.userId) return;
            try {
                const admin = await db.get('SELECT isAdmin, name FROM users WHERE id = ?', socket.userId);
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

                const targetUser = await db.get('SELECT name FROM users WHERE id = ?', userId);
                const updatedMember = await db.get('SELECT isMuted FROM group_members WHERE groupId = ? AND userId = ?', groupId, userId);
                const action = updatedMember.isMuted ? 'muted' : 'unmuted';

                const systemMsg = `${admin.name} ${action} ${targetUser.name}`;
                await sendSystemMessage(groupId, systemMsg);

                await broadcastGroupMembers(groupId);

            } catch (err) {
                console.error('Error toggling mute:', err);
            }
        });

        socket.on('remove_from_group', async ({ groupId, userId }) => {
            if (!socket.userId) return;
            try {
                const admin = await db.get('SELECT isAdmin, name FROM users WHERE id = ?', socket.userId);
                if (!admin || !admin.isAdmin) {
                    socket.emit('error', 'Only admins can remove from groups');
                    return;
                }

                await db.run('DELETE FROM group_members WHERE groupId = ? AND userId = ?', groupId, userId);

                await broadcastGroupList(userId);

                const removedUser = await db.get('SELECT name FROM users WHERE id = ?', userId);
                const systemMsg = `${admin.name} removed ${removedUser.name}`;
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
                    SELECT u.id, u.name, u.avatar, gm.isMuted 
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
                for (const [userId, userData] of onlineUsers) {
                    io.to(userData.socketId).emit('receive_message', message);
                }
            } else {
                const members = await db.all('SELECT userId FROM group_members WHERE groupId = ?', groupId);
                for (const member of members) {
                    const userData = onlineUsers.get(member.userId);
                    if (userData) {
                        io.to(userData.socketId).emit('receive_message', message);
                    }
                }
            }
        }

        async function broadcastGroupMembers(groupId) {
            const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);

            const members = await db.all(`
                SELECT u.id, u.name, u.avatar, gm.isMuted 
                FROM users u 
                JOIN group_members gm ON u.id = gm.userId 
                WHERE gm.groupId = ?
             `, groupId);

            if (group && group.isPublic) {
                for (const [userId, userData] of onlineUsers) {
                    const user = await db.get('SELECT isAdmin FROM users WHERE id = ?', userId);
                    if (user && user.isAdmin) {
                        io.to(userData.socketId).emit('group_members', { groupId, members });
                    } else {
                        io.to(userData.socketId).emit('group_members', { groupId, members: [] });
                    }
                }
            } else {
                const memberIds = members.map(m => m.id);
                for (const memberId of memberIds) {
                    const userData = onlineUsers.get(memberId);
                    if (userData) {
                        io.to(userData.socketId).emit('group_members', { groupId, members });
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

                const user = await db.get('SELECT name FROM users WHERE id = ?', socket.userId);
                const systemMsg = `${user.name} left the group`;
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

                const reader = await db.get('SELECT id, name, avatar, isInvisible FROM users WHERE id = ?', socket.userId);

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
                            for (const [uid, userData] of onlineUsers) {
                                io.to(userData.socketId).emit('message_read_update', readUpdate);
                            }
                        } else {
                            const members = await db.all('SELECT userId FROM group_members WHERE groupId = ?', groupId);
                            for (const member of members) {
                                const userData = onlineUsers.get(member.userId);
                                if (userData) io.to(userData.socketId).emit('message_read_update', readUpdate);
                            }
                        }
                    } else {
                        socket.emit('message_read_update', readUpdate);

                        if (senderId) {
                            const senderData = onlineUsers.get(senderId);
                            if (senderData) {
                                io.to(senderData.socketId).emit('message_read_update', readUpdate);
                            }
                        }
                    }
                }

            } catch (err) {
                console.error('Error marking read:', err);
            }
        });

        async function broadcastGroupList(targetUserId) {
            const userData = onlineUsers.get(targetUserId);
            if (!userData) return;

            const groups = await db.all(`
            SELECT DISTINCT g.id, g.name, g.isPublic
            FROM groups g
            LEFT JOIN group_members gm ON g.id = gm.groupId
            WHERE g.isPublic = 1 OR gm.userId = ?
        `, targetUserId);

            io.to(userData.socketId).emit('group_list', groups);
        }

        async function broadcastUserList() {
            try {
                const users = await db.all('SELECT id, name, avatar, isInvisible, isAdmin FROM users');
                const adminIds = new Set(users.filter(u => u.isAdmin).map(u => u.id));

                for (const [userId, userData] of onlineUsers) {
                    const visibleUsers = [];
                    const isViewerAdmin = adminIds.has(userId);

                    let sharedPrivateGroupUserIds = new Set();
                    if (!isViewerAdmin) {
                        const myPrivateGroups = await db.all(`
                            SELECT gm.groupId 
                            FROM group_members gm
                            JOIN groups g ON gm.groupId = g.id
                            WHERE gm.userId = ? AND g.isPublic = 0
                        `, userId);

                        const myPrivateGroupIds = myPrivateGroups.map(g => g.groupId);

                        if (myPrivateGroupIds.length > 0) {
                            const sharedMembers = await db.all(`
                                SELECT userId 
                                FROM group_members 
                                WHERE groupId IN (${myPrivateGroupIds.join(',')})
                            `);
                            sharedMembers.forEach(m => sharedPrivateGroupUserIds.add(m.userId));
                        }
                    }

                    for (const otherUser of users) {
                        // Attach public key if available
                        const otherUserData = onlineUsers.get(otherUser.id);
                        const publicKey = otherUserData ? otherUserData.publicKey : null;

                        const userWithKey = { ...otherUser, publicKey };

                        if (otherUser.id === userId) {
                            visibleUsers.push({ ...userWithKey, status: 'online' });
                            continue;
                        }

                        const isOtherOnline = !!otherUserData;
                        let status = isOtherOnline ? 'online' : 'offline';

                        if (otherUser.isInvisible) {
                            if (isViewerAdmin) {
                                if (isOtherOnline) status = 'invisible';
                                visibleUsers.push({ ...userWithKey, status });
                            } else if (sharedPrivateGroupUserIds.has(otherUser.id)) {
                                visibleUsers.push({ ...userWithKey, status });
                            } else {
                                continue;
                            }
                        } else {
                            visibleUsers.push({ ...userWithKey, status });
                        }
                    }

                    io.to(userData.socketId).emit('user_list', visibleUsers);
                }

            } catch (err) {
                console.error('Error broadcasting user list:', err);
            }
        }
    });
};
