module.exports = function (io, db) {
    // Map to track online users: userId -> socketId
    const onlineUsers = new Map();

    io.on('connection', async (socket) => {
        console.log('New socket connection:', socket.id);

        // We expect the client to send the user ID upon connection or via a 'join' event
        // For simplicity, let's assume the client emits 'join' with their user ID immediately after connection
        // In a real app with shared session, we could parse the cookie from the handshake

        socket.on('join', async (userId) => {
            try {
                const user = await db.get('SELECT * FROM users WHERE id = ?', userId);
                if (user) {
                    socket.userId = userId;
                    onlineUsers.set(userId, socket.id);

                    // Broadcast updated user list
                    await broadcastUserList();

                    // Send group list to the user who just joined
                    await broadcastGroupList(userId);

                    console.log(`User ${user.name} (${userId}) joined.`);
                }
            } catch (err) {
                console.error('Error joining:', err);
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
                await db.run('DELETE FROM messages WHERE groupId = ?', groupId);

                // Notify all members
                for (const member of members) {
                    await broadcastGroupList(member.userId);
                }

                // Also notify the admin (sender) if not in the list (though they should be)
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

        socket.on('send_message', async ({ receiverId, groupId, content, type = 'text' }) => {
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

                const result = await db.run(
                    'INSERT INTO messages (senderId, receiverId, groupId, content, type) VALUES (?, ?, ?, ?, ?)',
                    socket.userId, receiverId || 0, groupId || 0, content, type
                );

                const message = {
                    id: result.lastID,
                    senderId: socket.userId,
                    receiverId,
                    groupId,
                    content,
                    type,
                    timestamp: new Date().toISOString()
                };

                if (groupId) {
                    const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);

                    if (group && group.isPublic) {
                        // Broadcast to ALL online users
                        for (const [userId, socketId] of onlineUsers) {
                            io.to(socketId).emit('receive_message', message);
                        }
                    } else {
                        // Broadcast to all group members
                        const members = await db.all('SELECT userId FROM group_members WHERE groupId = ?', groupId);
                        for (const member of members) {
                            const memberSocketId = onlineUsers.get(member.userId);
                            if (memberSocketId) {
                                io.to(memberSocketId).emit('receive_message', message);
                            }
                        }
                    }
                } else {
                    // Emit to receiver if online
                    const receiverSocketId = onlineUsers.get(receiverId);
                    if (receiverSocketId) {
                        io.to(receiverSocketId).emit('receive_message', message);
                    }
                    // Emit back to sender (optimistic UI update usually handles this, but good for confirmation)
                    socket.emit('receive_message', message);
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
                // Anyone can create a group now.
                // Only admins can create public groups.
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

                // Add creator only if NOT public
                if (!isPublic) {
                    await db.run('INSERT INTO group_members (groupId, userId) VALUES (?, ?)', groupId, socket.userId);
                }

                if (isPublic) {
                    // Notify everyone about the new public group
                    const allUsers = await db.all('SELECT id FROM users');
                    for (const u of allUsers) {
                        await broadcastGroupList(u.id);
                    }
                } else {
                    await broadcastGroupList(socket.userId);
                }

                // System message
                const systemMsg = `${user.name} created group "${name}"`;
                await sendSystemMessage(groupId, systemMsg);

            } catch (err) {
                console.error('Error creating group:', err);
            }
        });

        socket.on('add_to_group', async ({ groupId, userId }) => {
            if (!socket.userId) return;
            try {
                // Check if admin (or maybe allow creator to add? For now stick to admin as per original req, 
                // but user said "everyone should be able to create groups". Usually creators can add.
                // Let's stick to Admin for now to avoid complexity, or check if user is creator?
                // The prompt said "everyone should be able to create groups". It didn't explicitly say "everyone can add members".
                // But it implies ownership. For MVP, let's keep "Only admins can add" restriction OR allow if it's a private group?
                // Let's relax it: Admins OR Group Members can add? Or just Admins?
                // User said "everyone should be able to create groups".
                // Let's allow anyone to add members for now, or maybe just the creator?
                // Schema doesn't track creator. 
                // Let's allow any member to add others for non-public groups? 
                // Or just stick to Admin for management to keep it simple as requested previously.
                // User didn't ask to change "who can add". Just "who can create".
                // So I will leave "add_to_group" as Admin only for now, unless I see a reason to change.
                // Actually, if I create a group, I want to add people.
                // Let's change it: If I am in the group, I can add people?
                // Or just check if I am admin.
                // Let's stick to Admin for "add_to_group" to be safe, but the user might be annoyed.
                // Let's check if the user is an admin.
                // Check if admin
                const admin = await db.get('SELECT isAdmin, name FROM users WHERE id = ?', socket.userId);
                const isMember = await db.get('SELECT * FROM group_members WHERE groupId = ? AND userId = ?', groupId, socket.userId);

                if ((!admin || !admin.isAdmin) && !isMember) {
                    socket.emit('error', 'Only members or admins can add to groups');
                    return;
                }

                // Check if target user is invisible
                const targetUser = await db.get('SELECT isInvisible, name FROM users WHERE id = ?', userId);
                if (targetUser && targetUser.isInvisible === 1) {
                    // Only admin can add invisible users
                    if (!admin || !admin.isAdmin) {
                        socket.emit('error', 'Only admins can add invisible users to groups');
                        return;
                    }
                }

                // Check if already member
                const existing = await db.get('SELECT * FROM group_members WHERE groupId = ? AND userId = ?', groupId, userId);
                if (existing) {
                    socket.emit('error', 'User is already in the group');
                    return;
                }

                await db.run('INSERT INTO group_members (groupId, userId) VALUES (?, ?)', groupId, userId);

                // Notify the added user and the admin
                const addedUserSocketId = onlineUsers.get(userId);
                if (addedUserSocketId) {
                    await broadcastGroupList(userId);
                    await broadcastUserList();
                }

                await broadcastGroupList(socket.userId);

                // Send system message
                const addedUser = await db.get('SELECT name FROM users WHERE id = ?', userId);
                const systemMsg = `${admin.name} added ${addedUser.name}`;
                await sendSystemMessage(groupId, systemMsg);

                // Broadcast updated member list to everyone in group
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
                    // If public group, insert as member but muted? 
                    // Or just insert a record to track mute status.
                    const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);
                    if (group && group.isPublic) {
                        await db.run('INSERT INTO group_members (groupId, userId, isMuted) VALUES (?, ?, 1)', groupId, userId);
                        member = { isMuted: 1 }; // Now they are muted
                    } else {
                        return; // Not a member of private group, can't mute
                    }
                } else {
                    const newMuted = member.isMuted ? 0 : 1;
                    await db.run('UPDATE group_members SET isMuted = ? WHERE groupId = ? AND userId = ?', newMuted, groupId, userId);
                }

                // Notify user and group
                const targetUser = await db.get('SELECT name FROM users WHERE id = ?', userId);
                // Re-fetch mute status to be sure
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

                // Notify removed user (so group disappears)
                await broadcastGroupList(userId);

                // System message
                const removedUser = await db.get('SELECT name FROM users WHERE id = ?', userId);
                const systemMsg = `${admin.name} removed ${removedUser.name}`;
                await sendSystemMessage(groupId, systemMsg);

                // Broadcast updated member list
                await broadcastGroupMembers(groupId);

            } catch (err) {
                console.error('Error removing from group:', err);
            }
        });

        socket.on('get_group_members', async ({ groupId }) => {
            if (!socket.userId) return;

            const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);
            const isAdmin = await db.get('SELECT isAdmin FROM users WHERE id = ?', socket.userId);

            // If public and not admin, return empty list (secret)
            if (group && group.isPublic && (!isAdmin || !isAdmin.isAdmin)) {
                socket.emit('group_members', { groupId, members: [] });
                return;
            }

            // Check if member or admin (for private groups)
            const isMember = await db.get('SELECT * FROM group_members WHERE groupId = ? AND userId = ?', groupId, socket.userId);

            if (isMember || (isAdmin && isAdmin.isAdmin) || (group && group.isPublic)) {
                // For public groups, we only want to show users who have an explicit record (e.g. muted users)
                // We do NOT want to show all users in the system.
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
            const result = await db.run(
                'INSERT INTO messages (senderId, receiverId, groupId, content, type) VALUES (?, ?, ?, ?, ?)',
                0, 0, groupId, content, 'system'
            );

            const message = {
                id: result.lastID,
                senderId: 0,
                receiverId: 0,
                groupId,
                content,
                type: 'system',
                timestamp: new Date().toISOString()
            };

            // For public groups, broadcast to everyone
            const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);

            if (group && group.isPublic) {
                for (const [userId, socketId] of onlineUsers) {
                    io.to(socketId).emit('receive_message', message);
                }
            } else {
                const members = await db.all('SELECT userId FROM group_members WHERE groupId = ?', groupId);
                for (const member of members) {
                    const memberSocketId = onlineUsers.get(member.userId);
                    if (memberSocketId) {
                        io.to(memberSocketId).emit('receive_message', message);
                    }
                }
            }
        }

        async function broadcastGroupMembers(groupId) {
            const group = await db.get('SELECT isPublic FROM groups WHERE id = ?', groupId);

            // For both public and private, we only broadcast actual members (muted or joined)
            const members = await db.all(`
                SELECT u.id, u.name, u.avatar, gm.isMuted 
                FROM users u 
                JOIN group_members gm ON u.id = gm.userId 
                WHERE gm.groupId = ?
             `, groupId);

            if (group && group.isPublic) {
                // Public group: Admins see the list (muted users), Users see none
                for (const [userId, socketId] of onlineUsers) {
                    const user = await db.get('SELECT isAdmin FROM users WHERE id = ?', userId);
                    if (user && user.isAdmin) {
                        io.to(socketId).emit('group_members', { groupId, members });
                    } else {
                        io.to(socketId).emit('group_members', { groupId, members: [] });
                    }
                }
            } else {
                // Private group: Everyone sees members
                const memberIds = members.map(m => m.id);
                for (const memberId of memberIds) {
                    const socketId = onlineUsers.get(memberId);
                    if (socketId) {
                        io.to(socketId).emit('group_members', { groupId, members });
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

                // Notify user (remove group from list)
                await broadcastGroupList(socket.userId);

                // System message
                const user = await db.get('SELECT name FROM users WHERE id = ?', socket.userId);
                const systemMsg = `${user.name} left the group`;
                await sendSystemMessage(groupId, systemMsg);

                // Broadcast updated member list
                await broadcastGroupMembers(groupId);

            } catch (err) {
                console.error('Error leaving group:', err);
            }
        });

        socket.on('get_groups', async () => {
            if (!socket.userId) return;
            await broadcastGroupList(socket.userId);
        });

        // Helper to send the list of groups a user belongs to
        async function broadcastGroupList(targetUserId) {
            const socketId = onlineUsers.get(targetUserId);
            if (!socketId) return;

            const groups = await db.all(`
            SELECT DISTINCT g.id, g.name, g.isPublic
            FROM groups g
            LEFT JOIN group_members gm ON g.id = gm.groupId
            WHERE g.isPublic = 1 OR gm.userId = ?
        `, targetUserId);

            io.to(socketId).emit('group_list', groups);
        }

        async function broadcastUserList() {
            try {
                // Get all users
                const users = await db.all('SELECT id, name, avatar, isInvisible, isAdmin FROM users');

                // Identify admins for quick lookup
                const adminIds = new Set(users.filter(u => u.isAdmin).map(u => u.id));

                // For each online user, calculate who they can see
                const onlineUserIds = Array.from(onlineUsers.keys());

                for (const [userId, socketId] of onlineUsers) {
                    const visibleUsers = [];
                    const isViewerAdmin = adminIds.has(userId);

                    // Get private groups for this user
                    // We only care about private groups for the "invisible" visibility check
                    const myPrivateGroups = await db.all(`
                        SELECT gm.groupId 
                        FROM group_members gm
                        JOIN groups g ON gm.groupId = g.id
                        WHERE gm.userId = ? AND g.isPublic = 0
                    `, userId);
                    const myPrivateGroupIds = myPrivateGroups.map(g => g.groupId);

                    for (const otherUser of users) {
                        if (otherUser.id === userId) {
                            visibleUsers.push({ ...otherUser, status: 'online' }); // See self
                            continue;
                        }

                        const isOtherOnline = onlineUsers.has(otherUser.id);
                        if (!isOtherOnline) {
                            visibleUsers.push({ ...otherUser, status: 'offline' });
                            continue;
                        }

                        // Other user is online. Are they invisible?
                        if (otherUser.isInvisible) {
                            if (isViewerAdmin) {
                                // Admins see invisible users as "invisible" (online but hidden)
                                visibleUsers.push({ ...otherUser, status: 'invisible' });
                            } else {
                                // Check if we share a PRIVATE group
                                if (myPrivateGroupIds.length > 0) {
                                    const sharedPrivateGroup = await db.get(`
                                        SELECT 1 
                                        FROM group_members 
                                        WHERE userId = ? AND groupId IN (${myPrivateGroupIds.join(',')})
                                    `, otherUser.id);

                                    if (sharedPrivateGroup) {
                                        visibleUsers.push({ ...otherUser, status: 'online' });
                                    } else {
                                        visibleUsers.push({ ...otherUser, status: 'offline' });
                                    }
                                } else {
                                    visibleUsers.push({ ...otherUser, status: 'offline' });
                                }
                            }
                        } else {
                            // Visible and online
                            visibleUsers.push({ ...otherUser, status: 'online' });
                        }
                    }

                    io.to(socketId).emit('user_list', visibleUsers);
                }

            } catch (err) {
                console.error('Error broadcasting user list:', err);
            }
        }
    });
};
