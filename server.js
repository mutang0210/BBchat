const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 靜態檔案路由（讓前端網頁可以顯示）
app.use(express.static(__dirname + '/public'));

// 儲存正在等待配對的使用者
let waitingQueue = [];

io.on('connection', (socket) => {
    console.log('有新使用者連線');

    // 監聽使用者加入配對
    socket.on('join_match', (userData) => {
        // 將使用者資訊與 socket 綁定
        socket.userData = {
            nickname: userData.nickname || '神秘人',
            gender: userData.gender || '不透露'
        };
        
        // 放入等待佇列
        waitingQueue.push(socket);
        socket.emit('status', '正在幫您尋找陌生人...');

        // 嘗試配對
        checkAndMatch();
    });

    // 監聽發送訊息
    socket.on('send_msg', (msg) => {
        if (socket.roomName) {
            // 轉傳訊息給同一個房間的另一個人
            socket.to(socket.roomName).emit('receive_msg', {
                sender: socket.userData.nickname,
                text: msg
            });
        }
    });

    // 監聽斷線或離開
    socket.on('disconnect', () => {
        handleDisconnect(socket);
    });
    
    socket.on('leave_room', () => {
        handleDisconnect(socket);
    });
});

function checkAndMatch() {
    // 當等待人數大於等於 2 人時進行配對
    while (waitingQueue.length >= 2) {
        const user1 = waitingQueue.shift();
        const user2 = waitingQueue.shift();

        // 建立一個唯一的房間名稱
        const roomName = `room_${user1.id}_${user2.id}`;
        
        user1.join(roomName);
        user2.join(roomName);

        user1.roomName = roomName;
        user2.roomName = roomName;

        // 通知雙方配對成功，並告知對方的資訊
        user1.emit('match_success', { target: user2.userData });
        user2.emit('match_success', { target: user1.userData });
    }
}

function handleDisconnect(socket) {
    // 1. 如果在等待佇列中，將其移除
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);

    // 2. 如果在房間中，通知另一個人對方已離開
    if (socket.roomName) {
        socket.to(socket.roomName).emit('peer_left', '對方已經離開了聊天...');
        socket.leave(socket.roomName);
        socket.roomName = null;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`伺服器已啟動：http://localhost:${PORT}`));