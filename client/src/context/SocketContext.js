import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children, user }) => {
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        if (user) {
            const newSocket = io('/', {
                withCredentials: true
            });

            newSocket.on('connect', () => {
                console.log('Connected to socket');
                newSocket.emit('join', user.id);
            });

            setSocket(newSocket);

            return () => newSocket.close();
        }
    }, [user]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};
