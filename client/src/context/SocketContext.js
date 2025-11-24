import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children, user }) => {
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (user) {
            const newSocket = io('/', {
                withCredentials: true
            });

            newSocket.on('connect', () => {
                console.log('Connected to socket');
                setIsConnected(true);
                newSocket.emit('join', user.id);
            });

            newSocket.on('disconnect', () => {
                console.log('Disconnected from socket');
                setIsConnected(false);
            });

            newSocket.on('ping', () => {
                console.log('Ping received from server');
            });

            setSocket(newSocket);

            return () => newSocket.close();
        }
    }, [user]);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};
